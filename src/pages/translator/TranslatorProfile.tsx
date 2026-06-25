import CreatorProfilePage from "@/components/profile/CreatorProfilePage";

export default function TranslatorProfile() {
  return (
    <CreatorProfilePage
      roleLabel="Translator"
      bioLabel="Translator Bio"
      bioPlaceholder="Tell readers about your translation work"
      specialtyLabel="Genre / Focus Area"
      specialtyPlaceholder="e.g. Fiction, Poetry, Non-fiction"
    />
  );
}
