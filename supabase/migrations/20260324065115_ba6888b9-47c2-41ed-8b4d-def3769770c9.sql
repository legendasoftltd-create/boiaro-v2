
-- =============================================
-- BOIARO DATABASE SCHEMA
-- =============================================

-- 1. Utility function for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2. User roles enum and table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 3. Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  preferred_language TEXT DEFAULT 'bn',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Authors
CREATE TABLE public.authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  avatar_url TEXT,
  bio TEXT,
  genre TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors viewable by everyone" ON public.authors FOR SELECT USING (true);
CREATE POLICY "Admins can manage authors" ON public.authors FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_authors_updated_at BEFORE UPDATE ON public.authors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Narrators
CREATE TABLE public.narrators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  avatar_url TEXT,
  bio TEXT,
  specialty TEXT,
  rating NUMERIC(2,1) DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.narrators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Narrators viewable by everyone" ON public.narrators FOR SELECT USING (true);
CREATE POLICY "Admins can manage narrators" ON public.narrators FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_narrators_updated_at BEFORE UPDATE ON public.narrators FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Publishers
CREATE TABLE public.publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  logo_url TEXT,
  description TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Publishers viewable by everyone" ON public.publishers FOR SELECT USING (true);
CREATE POLICY "Admins can manage publishers" ON public.publishers FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_publishers_updated_at BEFORE UPDATE ON public.publishers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_bn TEXT,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories viewable by everyone" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 8. Master Books table
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  title_en TEXT,
  slug TEXT UNIQUE NOT NULL,
  author_id UUID REFERENCES public.authors(id) ON DELETE SET NULL,
  publisher_id UUID REFERENCES public.publishers(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  cover_url TEXT,
  description TEXT,
  description_bn TEXT,
  rating NUMERIC(2,1) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  total_reads INTEGER DEFAULT 0,
  published_date DATE,
  language TEXT DEFAULT 'bn',
  tags TEXT[],
  is_featured BOOLEAN DEFAULT false,
  is_new BOOLEAN DEFAULT false,
  is_bestseller BOOLEAN DEFAULT false,
  is_free BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Books viewable by everyone" ON public.books FOR SELECT USING (true);
CREATE POLICY "Admins can manage books" ON public.books FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_books_slug ON public.books(slug);
CREATE INDEX idx_books_author ON public.books(author_id);
CREATE INDEX idx_books_category ON public.books(category_id);

-- 9. Book Formats
CREATE TYPE public.book_format_type AS ENUM ('ebook', 'audiobook', 'hardcopy');
CREATE TYPE public.binding_type AS ENUM ('paperback', 'hardcover');
CREATE TYPE public.audio_quality AS ENUM ('standard', 'hd');

CREATE TABLE public.book_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  format book_format_type NOT NULL,
  price NUMERIC(10,2) DEFAULT 0,
  pages INTEGER,
  file_size TEXT,
  file_url TEXT,
  preview_chapters INTEGER,
  narrator_id UUID REFERENCES public.narrators(id) ON DELETE SET NULL,
  duration TEXT,
  audio_quality audio_quality DEFAULT 'standard',
  chapters_count INTEGER,
  original_price NUMERIC(10,2),
  discount INTEGER,
  binding binding_type,
  weight TEXT,
  dimensions TEXT,
  in_stock BOOLEAN DEFAULT true,
  stock_count INTEGER DEFAULT 0,
  delivery_days INTEGER DEFAULT 3,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, format)
);
ALTER TABLE public.book_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Formats viewable by everyone" ON public.book_formats FOR SELECT USING (true);
CREATE POLICY "Admins can manage formats" ON public.book_formats FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_book_formats_book ON public.book_formats(book_id);

-- 10. Audiobook Tracks
CREATE TABLE public.audiobook_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_format_id UUID REFERENCES public.book_formats(id) ON DELETE CASCADE NOT NULL,
  track_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  duration TEXT,
  audio_url TEXT,
  is_preview BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audiobook_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tracks viewable by everyone" ON public.audiobook_tracks FOR SELECT USING (true);
CREATE POLICY "Admins can manage tracks" ON public.audiobook_tracks FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 11. Reviews
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews viewable by everyone" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews" ON public.reviews FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Bookmarks
CREATE TABLE public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bookmarks" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create bookmarks" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete bookmarks" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- 13. Reading Progress
CREATE TABLE public.reading_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  current_page INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  percentage NUMERIC(5,2) DEFAULT 0,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reading progress" ON public.reading_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert reading progress" ON public.reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update reading progress" ON public.reading_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_reading_progress_updated_at BEFORE UPDATE ON public.reading_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 14. Listening Progress
CREATE TABLE public.listening_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  current_track INTEGER DEFAULT 1,
  current_position NUMERIC(10,2) DEFAULT 0,
  total_duration NUMERIC(10,2) DEFAULT 0,
  percentage NUMERIC(5,2) DEFAULT 0,
  last_listened_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
ALTER TABLE public.listening_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own listening progress" ON public.listening_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert listening progress" ON public.listening_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update listening progress" ON public.listening_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_listening_progress_updated_at BEFORE UPDATE ON public.listening_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 15. Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  total_amount NUMERIC(10,2) DEFAULT 0,
  shipping_name TEXT,
  shipping_phone TEXT,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_zip TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 16. Order Items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  format book_format_type NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own order items" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Users can create order items" ON public.order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Admins can view all order items" ON public.order_items FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 17. Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT DEFAULT 'bkash' CHECK (method IN ('bkash', 'nagad', 'rocket', 'card', 'cod')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create payments" ON public.payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 18. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('book-covers', 'book-covers', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('audiobooks', 'audiobooks', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('ebooks', 'ebooks', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Book covers are public" ON storage.objects FOR SELECT USING (bucket_id = 'book-covers');
CREATE POLICY "Avatars are public" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Admins can upload book covers" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'book-covers' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can upload audiobooks" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'audiobooks' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can upload ebooks" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ebooks' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can access audiobooks" ON storage.objects FOR SELECT USING (bucket_id = 'audiobooks' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can access ebooks" ON storage.objects FOR SELECT USING (bucket_id = 'ebooks' AND auth.role() = 'authenticated');
