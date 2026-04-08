
-- Function to sync book_contributors from book metadata (authors, publishers, narrators)
CREATE OR REPLACE FUNCTION public.sync_book_contributors(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_author_user_id uuid;
  v_publisher_user_id uuid;
  v_narrator_record RECORD;
BEGIN
  -- Get writer user_id from authors table
  SELECT a.user_id INTO v_author_user_id
  FROM books b
  JOIN authors a ON a.id = b.author_id
  WHERE b.id = p_book_id AND a.user_id IS NOT NULL;

  IF v_author_user_id IS NOT NULL THEN
    INSERT INTO book_contributors (book_id, user_id, role, format)
    VALUES (p_book_id, v_author_user_id, 'writer', NULL)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get publisher user_id from publishers table
  SELECT p.user_id INTO v_publisher_user_id
  FROM books b
  JOIN publishers p ON p.id = b.publisher_id
  WHERE b.id = p_book_id AND p.user_id IS NOT NULL;

  IF v_publisher_user_id IS NOT NULL THEN
    INSERT INTO book_contributors (book_id, user_id, role, format)
    VALUES (p_book_id, v_publisher_user_id, 'publisher', NULL)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get narrator user_ids from book_formats + narrators table
  FOR v_narrator_record IN
    SELECT n.user_id
    FROM book_formats bf
    JOIN narrators n ON n.id = bf.narrator_id
    WHERE bf.book_id = p_book_id AND bf.format = 'audiobook' AND n.user_id IS NOT NULL
  LOOP
    INSERT INTO book_contributors (book_id, user_id, role, format)
    VALUES (p_book_id, v_narrator_record.user_id, 'narrator', 'audiobook')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Trigger function for books INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.trg_sync_book_contributors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM sync_book_contributors(NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger function for book_formats INSERT/UPDATE (narrator assignment)
CREATE OR REPLACE FUNCTION public.trg_sync_format_contributors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.narrator_id IS NOT NULL THEN
    PERFORM sync_book_contributors(NEW.book_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS sync_contributors_on_book ON books;
CREATE TRIGGER sync_contributors_on_book
  AFTER INSERT OR UPDATE OF author_id, publisher_id ON books
  FOR EACH ROW EXECUTE FUNCTION trg_sync_book_contributors();

DROP TRIGGER IF EXISTS sync_contributors_on_format ON book_formats;
CREATE TRIGGER sync_contributors_on_format
  AFTER INSERT OR UPDATE OF narrator_id ON book_formats
  FOR EACH ROW EXECUTE FUNCTION trg_sync_format_contributors();

-- Backfill: sync all existing books
DO $$
DECLARE
  v_book RECORD;
BEGIN
  FOR v_book IN SELECT id FROM books LOOP
    PERFORM sync_book_contributors(v_book.id);
  END LOOP;
END;
$$;
