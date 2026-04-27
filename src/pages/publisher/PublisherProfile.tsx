import CreatorProfilePage from "@/components/profile/CreatorProfilePage";

export default function PublisherProfile() {
  return (
    <CreatorProfilePage
      roleLabel="Publisher"
      bioLabel="About Your Publishing House"
      bioPlaceholder="Describe your publishing house and its mission"
      specialtyLabel="Focus Area"
      specialtyPlaceholder="e.g. Academic, Literature, Children's Books"
    />
  );
}
