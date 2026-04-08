
-- CMS Pages table
CREATE TABLE public.cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  featured_image text,
  status text NOT NULL DEFAULT 'draft',
  seo_title text,
  seo_description text,
  seo_keywords text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CMS pages viewable by everyone" ON public.cms_pages FOR SELECT USING (true);
CREATE POLICY "Admins can manage cms_pages" ON public.cms_pages FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Blog Posts table
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  cover_image text,
  excerpt text,
  content text NOT NULL DEFAULT '',
  author_name text,
  category text,
  tags text[] DEFAULT '{}',
  publish_date timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  is_featured boolean DEFAULT false,
  seo_title text,
  seo_description text,
  seo_keywords text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published blog posts viewable by everyone" ON public.blog_posts FOR SELECT USING (true);
CREATE POLICY "Admins can manage blog_posts" ON public.blog_posts FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Homepage Sections table
CREATE TABLE public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  display_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homepage sections viewable by everyone" ON public.homepage_sections FOR SELECT USING (true);
CREATE POLICY "Admins can manage homepage_sections" ON public.homepage_sections FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Hero Banners table
CREATE TABLE public.hero_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  cta_text text,
  cta_link text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hero_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active banners viewable by everyone" ON public.hero_banners FOR SELECT USING (true);
CREATE POLICY "Admins can manage hero_banners" ON public.hero_banners FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Seed default homepage sections
INSERT INTO public.homepage_sections (section_key, title, subtitle, sort_order, is_enabled) VALUES
  ('hero', 'Hero Banner', NULL, 0, true),
  ('new_releases', 'নতুন প্রকাশনা', 'সদ্য প্রকাশিত বইসমূহ', 1, true),
  ('trending', 'ট্রেন্ডিং বই', 'জনপ্রিয় বইসমূহ', 2, true),
  ('audiobooks', 'জনপ্রিয় অডিওবুক', 'শুনুন আপনার পছন্দের বই', 3, true),
  ('authors', 'জনপ্রিয় লেখক', 'আমাদের প্রিয় লেখকগণ', 4, true),
  ('categories', 'ক্যাটাগরি', 'বিষয় অনুযায়ী বই খুঁজুন', 5, true),
  ('free_books', 'ফ্রি বই', 'বিনামূল্যে পড়ুন', 6, true),
  ('recommended', 'আপনার জন্য', 'AI সাজেশন', 7, true),
  ('hardcopy', 'হার্ড কপি', 'সংগ্রহে রাখুন', 8, true),
  ('blog', 'ব্লগ ও আর্টিকেল', 'আমাদের সাম্প্রতিক লেখা', 9, true);

-- Seed default CMS pages
INSERT INTO public.cms_pages (title, slug, content, status) VALUES
  ('আমাদের সম্পর্কে', 'about', '', 'published'),
  ('যোগাযোগ', 'contact', '', 'published'),
  ('শর্তাবলী', 'terms', '', 'published'),
  ('গোপনীয়তা নীতি', 'privacy', '', 'published'),
  ('রিফান্ড পলিসি', 'refund', '', 'published'),
  ('সচরাচর জিজ্ঞাসা', 'faq', '', 'published');
