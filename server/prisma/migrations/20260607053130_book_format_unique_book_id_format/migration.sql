-- Prevent duplicate format rows (e.g. two "audiobook" entries) for the same book
ALTER TABLE "book_formats" ADD CONSTRAINT "book_formats_book_id_format_key" UNIQUE ("book_id", "format");
