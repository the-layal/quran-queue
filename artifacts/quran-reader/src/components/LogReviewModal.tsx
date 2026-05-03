// Stub during data-model rewrite. Full LogModal (page/ayah/surah selector with
// paintbrush) will be ported in task #151.
type Props = { onClose: () => void; onSuccess?: () => void };

export default function LogReviewModal({ onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 bottom-0 z-50 bg-card border border-border rounded-t-2xl p-6 shadow-2xl max-w-sm mx-auto">
        <h2 className="text-base font-semibold mb-1">Log Review</h2>
        <p className="text-xs text-muted-foreground mb-4">
          The review logger is being upgraded to support page, ayah-range, and
          surah-range references with a 1–5 vibe scale.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Close
        </button>
      </div>
    </>
  );
}
