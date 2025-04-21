export default function Button({ icon, children, onClick, className }) {
  return (
    <button
      className={`bg-black text-green-500 rounded-none p-4 flex items-center gap-1 border border-green-500 hover:bg-green-900 hover:text-green-400 ${className}`}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
