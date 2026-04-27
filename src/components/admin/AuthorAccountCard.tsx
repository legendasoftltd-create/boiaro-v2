import { CreatorAccountCard } from "./CreatorAccountCard";

interface AuthorAccountCardProps {
  authorId: string;
  authorName: string;
  userId: string | null;
  onLinkChanged: () => void;
}

export function AuthorAccountCard({ authorId, authorName, userId, onLinkChanged }: AuthorAccountCardProps) {
  return (
    <CreatorAccountCard
      profileId={authorId}
      profileName={authorName}
      profileTable="authors"
      creatorRole="writer"
      userId={userId}
      onLinkChanged={onLinkChanged}
    />
  );
}
