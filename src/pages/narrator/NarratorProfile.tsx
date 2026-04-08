import CreatorProfilePage from "@/components/profile/CreatorProfilePage";

export default function NarratorProfile() {
  return (
    <CreatorProfilePage
      roleLabel="Narrator"
      bioLabel="About You"
      bioPlaceholder="Your narration style, voice type, and specialties"
      specialtyLabel="Narration Specialty"
      specialtyPlaceholder="e.g. Fiction, Drama, Educational"
    />
  );
}
