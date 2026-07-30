// Walkthrough screen header: title + subtitle on the left, optional accessory
// (avatar initials, icon link, pill) on the right.
export default function ScreenTop({ title, sub, right }) {
  return (
    <div className="screen-top">
      <div>
        <h1 className="tt">{title}</h1>
        {sub && <div className="tsub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
