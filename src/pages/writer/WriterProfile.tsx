import CreatorProfilePage from "@/components/profile/CreatorProfilePage";

export default function WriterProfile() {
  return (
    <CreatorProfilePage
      roleLabel="Writer"
      bioLabel="Author Bio"
      bioPlaceholder="Tell readers about yourself and your writing journey"
      specialtyLabel="Genre / Focus Area"
      specialtyPlaceholder="e.g. Fiction, Poetry, Non-fiction"
    />
  );
}
