import { useMemo } from "react";
import { SearchableSelect } from "./SearchableSelect";

interface Category {
  id: string;
  name: string;
  name_bn?: string | null;
}

interface CategorySelectorProps {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
}

const CATEGORY_GROUPS: Record<string, string[]> = {
  "Literature": ["novel", "story", "poetry", "উপন্যাস", "গল্প", "কবিতা"],
  "Religious": ["islamic", "ইসলামিক"],
  "Knowledge": ["self development", "self-development", "history", "biography", "আত্মউন্নয়ন", "ইতিহাস", "জীবনী"],
  "Entertainment": ["horror", "thriller", "romance", "ভৌতিক", "থ্রিলার", "রোমান্টিক"],
};

function getGroupForCategory(cat: Category): string {
  const bn = (cat.name_bn || "").toLowerCase();
  const en = (cat.name || "").toLowerCase();
  for (const [group, keywords] of Object.entries(CATEGORY_GROUPS)) {
    if (keywords.some((k) => en.includes(k) || bn.includes(k))) return group;
  }
  return "Others";
}

export function CategorySelector({ categories, value, onChange }: CategorySelectorProps) {
  const options = useMemo(() => {
    const order = ["Literature", "Religious", "Knowledge", "Entertainment", "Others"];
    const grouped = categories.map((c) => ({
      cat: c,
      group: getGroupForCategory(c),
    }));
    grouped.sort((a, b) => {
      const ai = order.indexOf(a.group);
      const bi = order.indexOf(b.group);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return grouped.map(({ cat, group }) => ({
      id: cat.id,
      label: cat.name_bn || cat.name,
      searchAlt: cat.name,
      group,
    }));
  }, [categories]);

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Select category"
      searchPlaceholder="Search categories..."
      emptyText="No categories found"
    />
  );
}
