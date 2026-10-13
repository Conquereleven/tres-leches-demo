/**
 * What `/menu` serves before JavaScript runs: the approved site chrome and the
 * page heading, without any product. The catalog (names, prices, availability)
 * is rendered in the browser from the server's authority and is deliberately
 * not baked into static HTML, where it could go stale.
 */
import { CustomerCopy, english } from "../brand/localization";
import { SiteFooter, SiteHeader } from "../brand/SiteChrome";

const noop = () => {};
export function MenuShell() {
  return (
    <div className="brand-experience b-entered b-menu-page">
      <a className="b-skip" href="#main-content">
        <CustomerCopy>Skip to content</CustomerCopy>
      </a>
      <SiteHeader onContactUnavailable={noop} />
      <main id="main-content">
        <div className="b-menu-intro-mark" aria-hidden="true" />
        <h1 className="b-heading" style={{ textAlign: "center" }}>
          <CustomerCopy>{english.menu}</CustomerCopy>
        </h1>
      </main>
      <SiteFooter onContactUnavailable={noop} />
    </div>
  );
}
