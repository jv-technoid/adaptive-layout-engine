export function TopNav() {
  return (
    <header className="top-nav">
      <div className="nav-brand">
        <strong>FLAM</strong>
        <span>Adaptive Layout Engine</span>
      </div>
      <ul className="nav-links">
        <li>
          <a href="#demo" onClick={(e) => e.preventDefault()}>
            Models
          </a>
        </li>
        <li>
          <a href="#demo" onClick={(e) => e.preventDefault()}>
            Solutions
          </a>
        </li>
      </ul>
      <div className="nav-actions">
        <a className="btn btn-ghost" href="#demo" onClick={(e) => e.preventDefault()}>
          Contact
        </a>
        <a className="btn btn-solid" href="#demo">
          Demo
        </a>
      </div>
    </header>
  );
}
