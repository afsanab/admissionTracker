export default function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="ct-label">
      {children}
    </label>
  );
}
