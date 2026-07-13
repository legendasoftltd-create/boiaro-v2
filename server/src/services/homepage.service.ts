import { prisma } from "../lib/prisma.js";
import { resolveBookUrls, resolveUrls } from "../lib/mediaUrl.js";

const normalizeFormatType = (type?: string) => {
    if (!type) return null;
    const value = type.trim().toLowerCase();
    if (!value) return null;
    if (value === "hardcopy" || value === "hardcopies" || value === "hardcover") return "hard";
    return value;
};

export const getHomepageData = async (limit, userId?: string, type?: string) => {
    const parsedLimit = Number(limit);
    const takeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(Math.floor(parsedLimit), 50)
        : 10;
    const normalizedType = normalizeFormatType(type);

    const rawBooks = await prisma.book.findMany({
        where: { submission_status: "approved", is_active: true },
        orderBy: { created_at: "desc" },
        take: 200,
        include: {
            author: { select: { id: true, name: true, avatar_url: true } },
            translator: { select: { id: true, name: true, avatar_url: true } },
            category: { select: { id: true, name: true, slug: true } },
            formats: {
                where: { is_available: true },
                select: { format: true, price: true, in_stock: true }
            }
        }
    });
    // Resolve all file URLs once — every derived array below inherits correct URLs
    const allBooks = rawBooks.map(resolveBookUrls);

    //   total count 
    const counts = {
        totalEbooks: allBooks.filter(b => b.formats.some(f => f.format.toLowerCase() === "ebook")).length,
        totalAudiobooks: allBooks.filter(b => b.formats.some(f => f.format.toLowerCase() === "audiobook")).length,
        totalHardCopies: allBooks.filter(b => b.formats.some(f => f.format.toLowerCase().includes("hard"))).length,
    };

    const narrators = await prisma.narrator.findMany({});

    const featured = allBooks.filter(b => b.is_featured);
    const slider = (featured.length > 0 ? featured : allBooks).slice(0, 5);

    const totalNarrators = narrators.length;

    const allCategory = await prisma.category.findMany({
        where: {
            status: "active",
        },
        orderBy: [
            {
                priority: "desc",
            },
            {
                created_at: "desc",
            },
        ],
    });

    const allAuthor = await prisma.author.findMany({
        where: {
            status: "active",
        },
        orderBy: [
            {
                priority: "desc",
            },
            {
                created_at: "desc",
            },
        ],
    });

    const allNarrators = await prisma.narrator.findMany({
        where: {
            status: "active",
        },
        orderBy: [
            {
                priority: "desc",
            },
            {
                created_at: "desc",
            },
        ],
    });

    const allTranslators = await prisma.translator.findMany({
        where: {
            status: "active",
        },
        orderBy: [
            {
                priority: "desc",
            },
            {
                created_at: "desc",
            },
        ],
    });

    // Queried directly sorted by total_reads across the whole catalog — deriving this
    // from allBooks (capped at the 200 most-recently-created) silently excluded older
    // high-read books, causing this section to disagree with the website's Top10MostRead.
    const topTenMostReadRaw = await prisma.book.findMany({
        where: { submission_status: "approved", is_active: true },
        orderBy: { total_reads: "desc" },
        take: takeLimit,
        include: {
            author: { select: { id: true, name: true, avatar_url: true } },
            translator: { select: { id: true, name: true, avatar_url: true } },
            category: { select: { id: true, name: true, slug: true } },
            formats: {
                where: { is_available: true },
                select: { format: true, price: true, in_stock: true }
            }
        }
    });
    const topTenMostRead = topTenMostReadRaw.map(resolveBookUrls);


    const bookListInclude = {
        author: { select: { id: true, name: true, avatar_url: true } },
        translator: { select: { id: true, name: true, avatar_url: true } },
        category: { select: { id: true, name: true, slug: true } },
        formats: { where: { is_available: true }, select: { format: true, price: true, in_stock: true } },
    } as const;

    // Popular/free lists below are queried directly against the full catalog (sorted by
    // total_reads, or filtered by is_free) instead of derived from allBooks (capped at the
    // 200 most-recently-created books). Deriving from allBooks silently dropped older
    // popular/free books and made this snapshot disagree with the equivalent paginated
    // REST sections (popularAudiobooks, popularHardCopies, popularEbooks, freeBooks) and
    // with the website, which already query the full catalog directly.
    //
    // The per-format `submission_status: "approved"` check (in addition to is_available)
    // matches every other book/format query in the codebase (browseBooks, getBookById,
    // getBookBySlug) — a format can be is_available but still pending its own approval,
    // and without this check a book could show as a "popular audiobook" here while its
    // audiobook isn't actually live/approved yet on the book's own page or on the website.
    const [popularAudiobooksRaw, popularHardCopiesRaw, popularEbooksRaw] = await Promise.all([
        prisma.book.findMany({
            where: { submission_status: "approved", is_active: true, formats: { some: { format: "audiobook", is_available: true, submission_status: "approved" } } },
            orderBy: { total_reads: "desc" },
            take: takeLimit,
            include: bookListInclude,
        }),
        prisma.book.findMany({
            where: { submission_status: "approved", is_active: true, formats: { some: { format: "hardcopy", is_available: true, submission_status: "approved" } } },
            orderBy: { total_reads: "desc" },
            take: takeLimit,
            include: bookListInclude,
        }),
        prisma.book.findMany({
            where: { submission_status: "approved", is_active: true, formats: { some: { format: "ebook", is_available: true, submission_status: "approved" } } },
            orderBy: { total_reads: "desc" },
            take: takeLimit,
            include: bookListInclude,
        }),
    ]);
    const popularAudiobooks = popularAudiobooksRaw.map(resolveBookUrls);
    const popularHardCopies = popularHardCopiesRaw.map(resolveBookUrls);
    const popularEbooks = popularEbooksRaw.map(resolveBookUrls);

    // Mirrors trpc.books.trending exactly (same activity log, same 7-day window, same
    // scoring) so the REST homepage API and the website's "Trending Now" section never
    // disagree. Looks up matching books directly rather than filtering allBooks, since
    // a genuinely trending older book can fall outside the latest-200-created window above.
    const trendingSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trendingActivity = await prisma.userActivityLog.findMany({
        where: {
            action: { in: ["book_view", "book_read", "book_purchase"] },
            created_at: { gte: trendingSince },
            book_id: { not: null },
        },
        select: { book_id: true },
    });
    const trendingScores: Record<string, number> = {};
    trendingActivity.forEach((row) => {
        if (row.book_id) trendingScores[row.book_id] = (trendingScores[row.book_id] || 0) + 1;
    });
    const trendingBookIds = Object.entries(trendingScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, takeLimit)
        .map(([id]) => id);

    const trendingBooksMap = new Map(allBooks.map((b) => [b.id, b]));
    const missingTrendingIds = trendingBookIds.filter((id) => !trendingBooksMap.has(id));
    if (missingTrendingIds.length > 0) {
        const extraBooks = await prisma.book.findMany({
            where: { id: { in: missingTrendingIds }, submission_status: "approved", is_active: true },
            include: {
                author: { select: { id: true, name: true, avatar_url: true } },
                translator: { select: { id: true, name: true, avatar_url: true } },
                category: { select: { id: true, name: true, slug: true } },
                formats: { where: { is_available: true }, select: { format: true, price: true, in_stock: true } },
            },
        });
        extraBooks.map(resolveBookUrls).forEach((b) => trendingBooksMap.set(b.id, b));
    }

    const trendingNow = trendingBookIds
        .map((id) => trendingBooksMap.get(id))
        .filter((b) => b && b.is_active !== false);

    const getByFormat = (list, formatName) => {
        return list.filter(book =>
            book.formats?.some(f => f.format.toLowerCase().includes(formatName.toLowerCase()))
        );
    };
    const filterBooksByType = (list) => {
        if (!normalizedType) return list;
        return list.filter(book =>
            book.formats?.some(f => f.format.toLowerCase().includes(normalizedType))
        );
    };

    const appDownload = await prisma.siteSetting.findMany({
        where: {
            key: {
                in: [
                    "brand_name",
                    "app_ios_url",
                    "app_store_url",
                    "app_android_url",
                    "google_play_url"
                ]
            }
        },
        select: {
            key: true,
            value: true,
        },
    });


    const popularBooksRaw = await prisma.book.findMany({
        where: { submission_status: "approved", is_active: true, total_reads: { not: null } },
        orderBy: { total_reads: "desc" },
        take: takeLimit,
        include: bookListInclude,
    });
    const popularBooks = filterBooksByType(popularBooksRaw.map(resolveBookUrls));

    const BecauseYouRead = filterBooksByType(popularBooks).slice(0, takeLimit);

    const editorsPick = filterBooksByType(allBooks.filter(book => book.is_featured)).slice(0, takeLimit);


    let currentUser = null;
    let continueReading = [];
    let continueListening = [];

    if (userId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { profile: true }
            });

            if (user) {
                currentUser = {
                    id: user.id,
                    email: user.email,
                    profile: user.profile ? resolveUrls(user.profile) : null,
                };

                const progressData = await prisma.readingProgress.findMany({
                    where: { user_id: userId, percentage: { lt: 100 } },
                    orderBy: { updated_at: 'desc' },
                    take: takeLimit
                });

                continueReading = progressData.map(p => ({
                    ...p,
                    book: allBooks.find(b => b.id === p.book_id)
                })).filter(item => item.book);
            }
        } catch (e) {
            console.error("Homepage: error fetching user reading progress:", e);
        }

        try {
            const listeningData = await prisma.listeningProgress.findMany({
                where: { user_id: userId, percentage: { lt: 100 } },
                orderBy: { updated_at: 'desc' },
                take: takeLimit
            });

            continueListening = listeningData.map(p => {
                const book = allBooks.find(b => b.id === p.book_id);
                if (!book) return null;
                return {
                    ...p,
                    percentage: Number(p.percentage) || 0,
                    book: book
                };
            }).filter(Boolean);
        } catch (e) {
            console.error("Homepage: error fetching user listening progress:", e);
        }
    }

    // live radio station
    let station = null;
    let liveSession = null;
    try {
        station = await prisma.radioStation.findFirst({
            where: { is_active: true },
            orderBy: { sort_order: 'asc' }
        });
        liveSession = await prisma.liveSession.findFirst({
            where: { status: "live", ended_at: null },
        });
    } catch (e) {
        console.error("Homepage: error fetching radio/live session:", e);
    }



    const filteredTrendingNow = filterBooksByType(trendingNow).slice(0, takeLimit);
    const filteredTopMostRead = filterBooksByType(topTenMostRead).slice(0, takeLimit);
    const filteredSlider = filterBooksByType(slider).slice(0, takeLimit);
    const freeBooksRaw = await prisma.book.findMany({
        where: { submission_status: "approved", is_active: true, is_free: true },
        orderBy: { total_reads: "desc" },
        take: takeLimit,
        include: bookListInclude,
    });
    const filteredFreeBooks = filterBooksByType(freeBooksRaw.map(resolveBookUrls)).slice(0, takeLimit);
    const newReleaseBooks = allBooks.filter(b => b.is_new === true);

    const normalizedTypeIsAudiobook = normalizedType === "audiobook";
    const normalizedTypeIsEbook = normalizedType === "ebook";
    const normalizedTypeIsHardcopy = normalizedType === "hard";

    return {
        currentUser,
        continueListening,
        continueReading,
        radio: {
            station,
            liveSession
        },
        popularBooks,
        BecauseYouRead,
        editorsPick,
        appDownload,
        "trendingNow": {
            trendingNow: filteredTrendingNow,
            ebooks: getByFormat(filteredTrendingNow, "ebook"),
            audiobooks: getByFormat(filteredTrendingNow, "audiobook"),
            hardCopies: getByFormat(filteredTrendingNow, "hard"),
        },
        popularAudiobooks: normalizedType && !normalizedTypeIsAudiobook ? [] : popularAudiobooks,
        popularHardCopies: normalizedType && !normalizedTypeIsHardcopy ? [] : popularHardCopies,
        popularEbooks: normalizedType && !normalizedTypeIsEbook ? [] : popularEbooks,
        topTenMostRead: filteredTopMostRead,
        'slider': {
            slider: filteredSlider,
        },
        allCategory: allCategory.slice(0, takeLimit),
        allAuthor: allAuthor.slice(0, takeLimit).map(resolveUrls),
        allNarrators: allNarrators.slice(0, takeLimit).map(resolveUrls),
        allTranslators: allTranslators.slice(0, takeLimit).map(resolveUrls),
        "countsValue": { counts, totalNarrators },
        "NewReleases": {
            "all": filterBooksByType(newReleaseBooks).slice(0, takeLimit),
            "ebooks": filterBooksByType(newReleaseBooks.filter(b => b.formats.some(f => f.format.toLowerCase() === "ebook"))).slice(0, takeLimit),
            "audiobooks": filterBooksByType(newReleaseBooks.filter(b => b.formats.some(f => f.format.toLowerCase() === "audiobook"))).slice(0, takeLimit),
        },
        "FreeBooks": filteredFreeBooks,
    }

};
