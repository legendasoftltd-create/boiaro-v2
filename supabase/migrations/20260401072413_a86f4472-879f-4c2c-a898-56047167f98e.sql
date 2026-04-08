
CREATE OR REPLACE FUNCTION public.validate_isbn()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  v_clean text;
  v_sum integer := 0;
  v_i integer;
  v_ch char;
BEGIN
  -- Allow null or empty
  IF NEW.isbn IS NULL OR btrim(NEW.isbn) = '' THEN
    NEW.isbn := NULL;
    RETURN NEW;
  END IF;

  v_clean := regexp_replace(btrim(NEW.isbn), '[-\s]', '', 'g');

  IF length(v_clean) = 10 THEN
    -- ISBN-10: first 9 must be digits, last digit or X
    IF v_clean !~ '^\d{9}[\dXx]$' THEN
      RAISE EXCEPTION 'Invalid ISBN-10 format. Must be 9 digits followed by a digit or X.';
    END IF;
    FOR v_i IN 1..9 LOOP
      v_sum := v_sum + (11 - v_i) * (ascii(substr(v_clean, v_i, 1)) - 48);
    END LOOP;
    v_ch := upper(substr(v_clean, 10, 1));
    v_sum := v_sum + CASE WHEN v_ch = 'X' THEN 10 ELSE ascii(v_ch) - 48 END;
    IF v_sum % 11 != 0 THEN
      RAISE EXCEPTION 'Invalid ISBN-10 checksum.';
    END IF;

  ELSIF length(v_clean) = 13 THEN
    IF v_clean !~ '^\d{13}$' THEN
      RAISE EXCEPTION 'Invalid ISBN-13 format. Must be exactly 13 digits.';
    END IF;
    FOR v_i IN 1..13 LOOP
      v_sum := v_sum + (CASE WHEN v_i % 2 = 1 THEN 1 ELSE 3 END) * (ascii(substr(v_clean, v_i, 1)) - 48);
    END LOOP;
    IF v_sum % 10 != 0 THEN
      RAISE EXCEPTION 'Invalid ISBN-13 checksum.';
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid ISBN length. Must be ISBN-10 (10 chars) or ISBN-13 (13 chars).';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_isbn
  BEFORE INSERT OR UPDATE ON public.book_formats
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_isbn();
