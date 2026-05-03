import { LogModal } from "./LogModal";

type Props = { onClose: () => void; onSuccess?: () => void };

export default function LogReviewModal({ onClose }: Props) {
  return <LogModal isOpen={true} onClose={onClose} />;
}
