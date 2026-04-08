export type BookFormat = "ebook" | "audiobook" | "hardcopy"

export interface Author {
  id: string
  name: string
  nameEn: string
  avatar: string
  bio: string
  genre: string
  booksCount: number
  followers: string
  isFeatured: boolean
}

export interface Narrator {
  id: string
  name: string
  nameEn: string
  avatar: string
  bio: string
  specialty: string
  audiobooksCount: number
  listeners: string
  rating: number
  isFeatured: boolean
}

export interface Publisher {
  id: string
  name: string
  nameEn: string
  logo: string
  description: string
  booksCount: number
  isVerified: boolean
}

export interface Category {
  id: string
  name: string
  nameBn: string
  icon: string
  count: string
  color: string
}

export interface MasterBook {
  id: string
  title: string
  titleEn: string
  slug: string
  author: Author
  publisher: Publisher
  category: Category
  cover: string
  description: string
  descriptionBn: string
  rating: number
  reviewsCount: number
  totalReads: string
  publishedDate: string
  language: string
  tags: string[]
  isFeatured: boolean
  isNew: boolean
  isBestseller: boolean
  isFree: boolean
  formats: {
    ebook?: EbookFormat
    audiobook?: AudiobookFormat
    hardcopy?: HardcopyFormat
  }
}

export interface EbookFormat {
  available: boolean
  price: number
  pages: number
  fileSize: string
  previewChapters?: number
  previewPercentage?: number | null
}

export interface AudiobookFormat {
  available: boolean
  price: number
  duration: string
  narrator: Narrator
  chapters: number
  quality: "standard" | "hd"
  previewPercentage?: number | null
}

export interface HardcopyFormat {
  available: boolean
  price: number
  originalPrice?: number
  discount?: number
  pages: number
  binding: "paperback" | "hardcover"
  weight: string
  dimensions: string
  inStock: boolean
  stockCount?: number
  deliveryDays: number
}
