import { prisma } from "../lib/prisma.js";

export const getHomepageData = async (limit, userId?: string) => {
    const parsedLimit = Number(limit);
    const takeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(Math.floor(parsedLimit), 50)
        : 10;

    const allBooks = await prisma.book.findMany({
        where: { submission_status: "approved" },
        orderBy: { created_at: "desc" },
        take: 200,
        include: {
            author: { select: { id: true, name: true, avatar_url: true } },
            category: { select: { id: true, name: true, slug: true } },
            formats: {
                where: { is_available: true },
                select: { format: true, price: true, in_stock: true }
            }
        }
    });

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

    const topTenMostRead = [...allBooks]
        .sort((a, b) => (b.total_reads || 0) - (a.total_reads || 0))
        .slice(0, takeLimit);


    const allAudiobooks = allBooks.filter(book =>
        book.formats?.some(f => f.format.toLowerCase() === "audiobook")
    );

    const allHardCopies = allBooks.filter(book =>
        book.formats?.some(f => f.format.toLowerCase().includes("hard"))
    );

    const allEbooks = allBooks.filter(book =>
        book.formats?.some(f => f.format.toLowerCase() === "ebook")
    );

    // popular audio books
    const popularAudiobooks = [...allAudiobooks]
        .sort((a, b) => (b.total_reads || 0) - (a.total_reads || 0))
        .slice(0, takeLimit);

    // popular hard copy 
    const popularHardCopies = [...allHardCopies]
        .sort((a, b) => (b.total_reads || 0) - (a.total_reads || 0))
        .slice(0, takeLimit);

    const popularEbooks = [...allEbooks]
        .sort((a, b) => (b.total_reads || 0) - (a.total_reads || 0))
        .slice(0, takeLimit);

    const trendingNow = [...allBooks]
        .filter(book => (book.total_reads || 0) > 0)
        .sort((a, b) => {
            const scoreA = (a.total_reads * 5) + (a.is_featured ? 50 : 0);
            const scoreB = (b.total_reads * 5) + (b.is_featured ? 50 : 0);
            return scoreB - scoreA;
        })
        .slice(0, takeLimit);

    const getByFormat = (list, formatName) => {
        return list.filter(book =>
            book.formats?.some(f => f.format.toLowerCase().includes(formatName.toLowerCase()))
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


    const popularBooks = [...allBooks]
        .filter((book) => book.total_reads !== null)
        .sort((a, b) => (b.total_reads || 0) - (a.total_reads || 0))
        .slice(0, takeLimit);

    const BecauseYouRead = popularBooks.slice(0, takeLimit);

    const editorsPick = allBooks.filter(book => book.is_featured).slice(0, takeLimit);


    let currentUser = null;
    let continueReading = [];

    if (userId) {

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });

        if (user) {
            currentUser = {
                id: user.id,
                email: user.email,
                profile: user.profile
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
    }

    let continueListening = [];

    if (userId) {
        const listeningData = await prisma.listeningProgress.findMany({
            where: {
                user_id: userId,
                percentage: { lt: 100 }
            },
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
    }

    // live radio station 
    const station = await prisma.radioStation.findFirst({
        where: { is_active: true },
        orderBy: { sort_order: 'asc' }
    });

    const liveSession = await prisma.liveSession.findFirst({
        where: {
           
            status: "live",
            ended_at: null
        },
    });


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
            trendingNow,
            ebooks: getByFormat(trendingNow, "ebook"),
            audiobooks: getByFormat(trendingNow, "audiobook"),
            hardCopies: getByFormat(trendingNow, "hard"),
            pdf: getByFormat(trendingNow, "pdf"),
        },
        popularAudiobooks,
        popularHardCopies,
        popularEbooks,
        topTenMostRead,
        'slider': {
            slider: slider.slice(0, takeLimit),
        },
        allCategory: allCategory.slice(0, takeLimit),
        allAuthor: allAuthor.slice(0, takeLimit),
        allNarrators: allNarrators.slice(0, takeLimit),
        "countsValue": { counts, totalNarrators },
        "NewReleases": {
            "all": allBooks.slice(0, takeLimit),
            "ebooks": allBooks.filter(b => b.formats.some(f => f.format.toLowerCase() === "ebook")).slice(0, takeLimit),
            "audiobooks": allBooks.filter(b => b.formats.some(f => f.format.toLowerCase() === "audiobook")).slice(0, takeLimit),
            "pdf": allBooks.filter(b => b.formats.some(f => f.format.toLowerCase() === "pdf")).slice(0, takeLimit),
        },
        "FreeBooks": allBooks.filter(b => b.is_free === true).slice(0, takeLimit),
    }

};
