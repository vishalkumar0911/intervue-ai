export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10">
      <div className="container py-8 text-center text-sm text-white/60">
        © {new Date().getFullYear()} Intervue.AI — Mock interviews with real insights.
      </div>
    </footer>
  );
}
