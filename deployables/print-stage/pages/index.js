import Head from "next/head";
import { useEffect, useRef, useState } from "react";

import { SiteNavOverlay } from "../components/SiteNavOverlay";
import { MakerspaceConvertedPage } from "../components/makerspace/MakerspaceConvertedPage";
import { MakerspaceMobileConvertedPage } from "../components/makerspace/MakerspaceMobileConvertedPage";
import styles from "../styles/MakerspaceDesign.module.css";

const equipmentAsset = (name) => `/makerspace-design/assets/equipment/${name}`;
const eventAsset = (name) => `/makerspace-design/assets/events/${name}`;
const navAsset = (name) => `/makerspace-design/nav/${name}`;

const ADMIN_URL = "/admin/people";
const BORROW_ITEMS_URL = "/assets";
const MY_BOOKINGS_URL = "/assets/my-loans";
const ORDER_PRINT_URL = "/files";
const CS_COURSE_URL = "https://cs50.harvard.edu/x/";
const PRINT_GUIDE_URL = "https://blog.rahix.de/design-for-3d-printing/";
const MAKERSPACE_SU_URL = "https://www.thesubath.com/makerspace/";
const MAKERSPACE_VOLUNTEER_URL = "https://www.thesubath.com/makerspace/volunteer/";
const MAKERSPACE_WHATSAPP_URL = "https://chat.whatsapp.com/FsHJzfYdYSqD3RXnGSy40P";
const MAKERSPACE_DISCORD_URL = "https://discord.com/invite/j49wKknsBs";
const MAKERSPACE_INSTAGRAM_URL = "https://www.instagram.com/bathmakerspace?igsh=MTFkYjgyOXo3czEzbA%3D%3D&utm_source=qr";

const equipmentImages = [
  { image: "image40215.png", title: "Laser cutter", width: 671, height: 503, widthPercent: 34.7 },
  { image: "image93619.png", title: "Workshop benches", width: 676, height: 507, widthPercent: 34.7 },
  { image: "image94949.png", title: "3D printers", width: 684, height: 513, widthPercent: 34.7 },
  { image: "image95691.png", title: "Equipment storage", width: 666, height: 500, widthPercent: 34.7 },
];
const mobileEquipmentImages = equipmentImages.map((item) => ({ ...item, widthPercent: 90.6 }));
const eventCards = [
  {
    image: "image38001.png",
    title: "Halloween",
    subtitle: "Pumpkin carving, workshop games, and seasonal student builds.",
    width: 968,
    height: 645,
    widthPercent: 50.4,
    href: "/events/halloween",
  },
  {
    image: "image37259.png",
    title: "SUMO",
    subtitle: "Robot battles, student teams, and hands-on electronics sessions.",
    width: 642,
    height: 645,
    widthPercent: 33.5,
    href: "/events/sumo",
  },
];
const mobileEventCardWidthPercent = 88.7;
const mobileEventCardRatio = `${eventCards[1].width} / ${eventCards[1].height}`;
const mobileEventCards = eventCards.map((item) => ({
  ...item,
  widthPercent: mobileEventCardWidthPercent,
  displayRatio: mobileEventCardRatio,
}));

const galleryCycles = 3;
const homeNavItems = [
  { label: "Print", section: "print", tone: "#ffff00", width: "14.45%" },
  { label: "Volunteer", section: "volunteer", tone: "#078989", width: "28.39%" },
  { label: "Equipment", section: "equipment", tone: "#f36600", width: "29.18%" },
  { label: "Events", section: "events", tone: "#000000", width: "21.09%" },
];
const darkBackgroundSections = new Set(["print", "events"]);
const sectionTitleSelectors = {
  print: "[id='text8660-5-2']",
  equipment: "[id='text99774']",
  events: "[id='text8660-5-1']",
};
const phoneSectionTitleSelectors = {
  print: "[id='text8660-5-2-4']",
  equipment: "[id='text99774']",
  events: "[id='text8660-5-1']",
};
const printArrowTargets = {
  course: "44.35%",
  guide: "53.0%",
  order: "61.75%",
};
const mobilePrintArrowTargets = {
  course: "34.87%",
  guide: "35.87%",
  order: "36.96%",
};
const footerLeftLinks = [
  { label: "Whatsapp", href: MAKERSPACE_WHATSAPP_URL },
  { label: "Discord", href: MAKERSPACE_DISCORD_URL },
  { label: "Email", href: "mailto:su-makerspace@bath.ac.uk" },
  { label: "SU", href: MAKERSPACE_SU_URL },
  { label: "Instagram", href: MAKERSPACE_INSTAGRAM_URL },
];
const footerRightLinks = [
  { label: "Print", href: ORDER_PRINT_URL },
  { label: "Admin", href: ADMIN_URL },
  { label: "Borrow", href: BORROW_ITEMS_URL },
  { label: "Volunteer", href: MAKERSPACE_VOLUNTEER_URL },
  { label: "4E 2.29", section: "home", muted: true },
];

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function contrastTextFor(hexColor) {
  const hex = hexColor.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = [r, g, b].map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#f6f4ee";
}

function navbarArrowTipY() {
  const toggle = document.querySelector("[data-nav-toggle]");
  if (!toggle) return 0;
  const rect = toggle.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function visibleSectionTitleRect(section, selector) {
  if (!selector) return null;

  const sectionRect = section.getBoundingClientRect();
  const candidates = Array.from(section.querySelectorAll(selector))
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const area = rect.width * rect.height;
      return {
        rect,
        area,
        intersection: intersectionArea(rect, sectionRect),
        distanceFromSectionTop: Math.abs(rect.top - sectionRect.top),
      };
    })
    .filter(({ area }) => area > 0)
    .sort((a, b) => {
      if (b.intersection !== a.intersection) return b.intersection - a.intersection;
      if (b.area !== a.area) return b.area - a.area;
      return a.distanceFromSectionTop - b.distanceFromSectionTop;
    });

  return candidates[0]?.rect ?? null;
}

function sectionTitleCenterY(section, id) {
  const isPhone = document.querySelector("[data-layout='phone']");
  const selector = (isPhone ? phoneSectionTitleSelectors : sectionTitleSelectors)[id];
  const titleRect = visibleSectionTitleRect(section, selector);
  if (titleRect) {
    return window.scrollY + titleRect.top + titleRect.height / 2;
  }

  const rect = section.getBoundingClientRect();
  return window.scrollY + rect.top;
}

function scrollToSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  if (!sectionTitleSelectors[id]) {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const titleCenterY = sectionTitleCenterY(section, id);
  window.scrollTo({
    top: Math.max(0, titleCenterY - navbarArrowTipY()),
    behavior: "smooth",
  });
}

function navContrastForSection(sectionId) {
  return darkBackgroundSections.has(sectionId) ? "light" : "dark";
}

function usePhoneLayout() {
  const [isPhoneLayout, setIsPhoneLayout] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px), (pointer: coarse) and (max-width: 900px)");
    const update = () => setIsPhoneLayout(query.matches);
    update();
    query.addEventListener?.("change", update);
    if (!query.addEventListener) query.addListener(update);
    return () => {
      query.removeEventListener?.("change", update);
      if (!query.removeEventListener) query.removeListener(update);
    };
  }, []);

  return isPhoneLayout;
}

function DesignPlate({ page, alt }) {
  return (
    <MakerspaceConvertedPage
      page={page}
      alt={alt}
      className={styles.convertedPlate}
      imageClassName={styles.backgroundPlate}
      textClassName={styles.textOverlay}
    />
  );
}

function MobileDesignPlate({ designOpen }) {
  return (
    <MakerspaceMobileConvertedPage
      page={designOpen ? "mobileFullExpanded" : "mobileFullCollapsed"}
      alt="Bath Makerspace mobile site"
      className={styles.convertedPlate}
      imageClassName={styles.backgroundPlate}
      textClassName={styles.textOverlay}
    />
  );
}

function Hotspot({
  as: Component = "button",
  className,
  children,
  href,
  onClick,
  tone,
  label,
  printKey,
  controls,
  expanded,
  onPointerEnter,
  onFocus,
  onBlur,
}) {
  const props = Component === "button" ? { type: "button" } : { href };

  return (
    <Component
      {...props}
      className={`${styles.hotspot} ${label ? styles.labelHotspot : ""} ${className || ""}`}
      data-label={label || children}
      data-print-key={printKey || undefined}
      style={tone ? { "--tone": tone } : undefined}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
      onBlur={onBlur}
      aria-label={children}
      aria-controls={controls}
      aria-expanded={expanded}
    >
      <span>{children}</span>
    </Component>
  );
}

function OutlineButton({ children, className = "", tone, width, onClick, label }) {
  return (
    <button
      type="button"
      className={`${styles.outlineButton} ${className}`}
      style={{ "--button-tone": tone, "--button-width": width, "--button-contrast": contrastTextFor(tone) }}
      onClick={onClick}
      aria-label={label || children}
    >
      <span>{children}</span>
    </button>
  );
}

function FooterTextLink({ item }) {
  const Component = item.href ? "a" : "button";
  const props = item.href ? { href: item.href } : { type: "button", onClick: () => scrollToSection(item.section) };

  return (
    <Component
      {...props}
      className={`${styles.footerTextLink} ${item.muted ? styles.footerTextLinkMuted : ""}`}
      aria-label={item.label}
    >
      {item.label}
    </Component>
  );
}

function PrintHoverArrow({ activeKey, mobile = false }) {
  const arrowTargets = mobile ? mobilePrintArrowTargets : printArrowTargets;

  return (
    <svg
      className={styles.printHoverArrow}
      data-print-hover-arrow=""
      viewBox="-43 646 18 24"
      aria-hidden="true"
      style={{
        "--print-arrow-opacity": activeKey ? 1 : 0,
        "--print-arrow-top": arrowTargets[activeKey] || arrowTargets.course,
      }}
    >
      <path d="m -41.96286,648.84898 c -0.03337,4.38804 -0.562562,8.60784 2.528522,11.72252 3.091084,3.11468 1.873721,2.74981 6.261888,2.74981" />
      <path d="m -32.655401,668.07816 c -1.346344,-1.32604 -0.471492,-2.77108 -0.478672,-4.66078 -0.0072,-1.8897 -0.895827,-4.06767 0.440402,-5.4039 l 5.013347,5.01335 z" />
    </svg>
  );
}

function NavbarToggleArrow() {
  return (
    <svg className={styles.navToggleSvg} viewBox="0 0 7.8847664 23.537114" aria-hidden="true" focusable="false">
      <path
        className={styles.navToggleGlyph}
        d="M 0.3769539,0 H 0 L 7.3593758,11.699218 0.0429696,23.537109 H 0.3964559 L 7.8847668,11.697265 Z"
      />
    </svg>
  );
}

function GalleryCarousel({
  items,
  activeIndex,
  onChange,
  className = "",
  navClassName = "",
  label,
  imageBase,
  gapPercent,
  autoAdvanceMs = 4200,
  eventCards: usesEventCards = false,
}) {
  const itemCount = items.length;
  const [virtualIndex, setVirtualIndex] = useState(() => itemCount * Math.floor(galleryCycles / 2) + activeIndex);
  const [autoPaused, setAutoPaused] = useState(false);
  const [transitionSuppressed, setTransitionSuppressed] = useState(false);
  const virtualIndexRef = useRef(virtualIndex);
  const currentIndex = mod(virtualIndex, itemCount);
  const widthPercents = items.map((item) => item.widthPercent);
  const cycleWidth = widthPercents.reduce((sum, width) => sum + width, 0) + gapPercent * itemCount;
  const virtualCycle = Math.floor(virtualIndex / itemCount);
  const positionInCycle = mod(virtualIndex, itemCount);
  const beforeActive = widthPercents.slice(0, positionInCycle).reduce((sum, width) => sum + width, 0);
  const centerOffset = virtualCycle * cycleWidth + beforeActive + gapPercent * positionInCycle + widthPercents[positionInCycle] / 2;

  useEffect(() => {
    virtualIndexRef.current = virtualIndex;
  }, [virtualIndex]);

  function setVirtual(nextVirtual) {
    virtualIndexRef.current = nextVirtual;
    setVirtualIndex(nextVirtual);
    onChange(mod(nextVirtual, itemCount));
  }

  function move(delta) {
    const centeredVirtualIndex = itemCount + mod(virtualIndexRef.current, itemCount);
    setVirtual(centeredVirtualIndex + delta);
  }

  function select(targetIndex) {
    const centeredVirtualIndex = itemCount + mod(virtualIndexRef.current, itemCount);
    const candidates = [targetIndex, itemCount + targetIndex, itemCount * 2 + targetIndex];
    const nearest = candidates.reduce((best, candidate) =>
      Math.abs(candidate - centeredVirtualIndex) < Math.abs(best - centeredVirtualIndex) ? candidate : best
    );
    setVirtual(nearest);
  }

  useEffect(() => {
    if (autoPaused || itemCount <= 1) return undefined;

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      move(1);
    }, autoAdvanceMs);

    return () => window.clearInterval(interval);
  }, [autoAdvanceMs, autoPaused, itemCount]);

  useEffect(() => {
    if (itemCount <= 1 || (virtualIndex >= itemCount && virtualIndex < itemCount * 2)) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      const centeredVirtualIndex = itemCount + mod(virtualIndexRef.current, itemCount);
      virtualIndexRef.current = centeredVirtualIndex;
      setTransitionSuppressed(true);
      setVirtualIndex(centeredVirtualIndex);

      const frame = window.requestAnimationFrame(() => {
        setTransitionSuppressed(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }, 430);

    return () => window.clearTimeout(timeout);
  }, [itemCount, virtualIndex]);

  return (
    <>
      <div
        className={`${styles.galleryLayer} ${className}`}
        aria-label={`${label} gallery`}
        onPointerEnter={() => setAutoPaused(true)}
        onPointerLeave={() => setAutoPaused(false)}
        onFocusCapture={() => setAutoPaused(true)}
        onBlurCapture={() => setAutoPaused(false)}
      >
        <div
          className={styles.galleryTrack}
          data-transition-suppressed={transitionSuppressed ? "true" : undefined}
          style={{ transform: `translateX(calc(50% - ${centerOffset}%))` }}
        >
          {Array.from({ length: itemCount * galleryCycles }, (_, sequenceIndex) => {
            const item = items[sequenceIndex % itemCount];
            const itemStyle = {
              "--item-width": `${item.widthPercent}%`,
              "--item-ratio": item.displayRatio || `${item.width} / ${item.height}`,
            };
            const content = (
              <>
                <img className={styles.galleryMedia} src={imageBase(item.image)} alt="" draggable="false" />
                {usesEventCards && (
                  <>
                    <span className={styles.galleryShade} />
                    <span className={styles.galleryCaption}>{item.title}</span>
                    <span className={styles.gallerySubtitle}>{item.subtitle}</span>
                  </>
                )}
              </>
            );

            if (item.href) {
              return (
                <a
                  key={`${sequenceIndex}-${item.image}`}
                  className={`${styles.galleryItem} ${styles.galleryLinkItem}`}
                  href={item.href}
                  style={itemStyle}
                  aria-label={item.title}
                >
                  {content}
                </a>
              );
            }

            return (
              <figure key={`${sequenceIndex}-${item.image}`} className={styles.galleryItem} style={itemStyle}>
                {content}
              </figure>
            );
          })}
        </div>
      </div>
      <div
        className={`${styles.galleryNavigator} ${navClassName}`}
        style={{ "--node-count": itemCount }}
        aria-label={`${label} gallery controls`}
        onPointerEnter={() => setAutoPaused(true)}
        onPointerLeave={() => setAutoPaused(false)}
        onFocusCapture={() => setAutoPaused(true)}
        onBlurCapture={() => setAutoPaused(false)}
      >
        <button
          type="button"
          className={`${styles.galleryArrow} ${styles.galleryArrowPrev}`}
          onClick={() => move(-1)}
          aria-label={`Previous ${label} slide`}
        >
          <img className={styles.galleryArrowIcon} src={navAsset("arrow-prev.svg")} alt="" draggable="false" />
        </button>
        <div className={styles.galleryNodes}>
          {items.map((item, slideIndex) => (
            <button
              key={slideIndex}
              type="button"
              className={`${styles.galleryNode} ${slideIndex === currentIndex ? styles.galleryNodeActive : ""}`}
              onClick={() => select(slideIndex)}
              aria-label={`${label} slide ${slideIndex + 1}`}
              aria-current={slideIndex === currentIndex ? "true" : undefined}
            >
              <img className={styles.galleryNodeIcon} src={navAsset("dial.svg")} alt="" draggable="false" />
              <img className={styles.galleryNodeX} src={navAsset("active-x.svg")} alt="" draggable="false" />
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.galleryArrow} ${styles.galleryArrowNext}`}
          onClick={() => move(1)}
          aria-label={`Next ${label} slide`}
        >
          <img className={styles.galleryArrowIcon} src={navAsset("arrow-next.svg")} alt="" draggable="false" />
        </button>
      </div>
    </>
  );
}

function PageSection({ id, className = "", children, ...props }) {
  return (
    <section id={id} className={`${styles.vectorSection} ${className}`} {...props}>
      {children}
    </section>
  );
}

function MobileAnchor({ id, top }) {
  return <div id={id} className={styles.mobileAnchor} style={{ "--anchor-top": top }} aria-hidden="true" />;
}

function MobileMakerspaceContent({
  designOpen,
  setDesignOpen,
  equipmentSlide,
  setEquipmentSlide,
  eventSlide,
  setEventSlide,
  printHoverKey,
  setPrintHoverKey,
}) {
  return (
    <PageSection id="mobile-site" className={styles.mobileFullSection} data-slide-equipment={equipmentSlide} data-slide-events={eventSlide}>
      <MobileDesignPlate designOpen={designOpen} />
      <img
        className={styles.mobileWelcomeBox}
        src="/makerspace-design/generated/mobile-welcome-text-box.svg"
        alt=""
        aria-hidden="true"
      />
      <MobileAnchor id="home" top="0%" />
      <MobileAnchor id="volunteer" top="16.131%" />
      <MobileAnchor id="print" top="28.98%" />
      <MobileAnchor id="equipment" top="46.729%" />
      <MobileAnchor id="events" top="78.82%" />
      <MobileAnchor id="footer" top="95.294%" />

      <div className={styles.mobileVolunteerHotspots}>
        <Hotspot as="a" className={styles.mobileGetInvolvedHotspot} href={MAKERSPACE_VOLUNTEER_URL}>
          Get Involved
        </Hotspot>
        <Hotspot as="a" className={styles.mobileVolunteerEmailHotspot} href="mailto:su-makerspace@bath.ac.uk">
          su-makerspace@bath.ac.uk
        </Hotspot>
      </div>

      <div
        className={styles.mobilePrintHotspots}
        aria-label="Print menu controls"
        onPointerMove={(event) => {
          const item = event.target.closest("[data-print-key]");
          setPrintHoverKey(item?.dataset.printKey || null);
        }}
        onPointerLeave={() => setPrintHoverKey(null)}
      >
        <PrintHoverArrow activeKey={printHoverKey} mobile />
        <Hotspot
          as="a"
          className={styles.collectHotspot}
          href={MY_BOOKINGS_URL}
          onPointerEnter={() => setPrintHoverKey(null)}
          onFocus={() => setPrintHoverKey(null)}
          onBlur={() => setPrintHoverKey(null)}
        >
          Collect
        </Hotspot>
        <Hotspot
          className={styles.designHotspot}
          onClick={() => setDesignOpen((open) => !open)}
          onPointerEnter={() => setPrintHoverKey(null)}
          onFocus={() => setPrintHoverKey(null)}
          onBlur={() => setPrintHoverKey(null)}
          controls="mobile-design-print-menu"
          expanded={designOpen}
        >
          Design
        </Hotspot>
        {designOpen && (
          <div id="mobile-design-print-menu">
            <Hotspot
              as="a"
              className={styles.courseHotspot}
              href={CS_COURSE_URL}
              printKey="course"
              onPointerEnter={() => setPrintHoverKey("course")}
              onFocus={() => setPrintHoverKey("course")}
              onBlur={() => setPrintHoverKey(null)}
            >
              CS Course
            </Hotspot>
            <Hotspot
              as="a"
              className={styles.guideHotspot}
              href={PRINT_GUIDE_URL}
              printKey="guide"
              onPointerEnter={() => setPrintHoverKey("guide")}
              onFocus={() => setPrintHoverKey("guide")}
              onBlur={() => setPrintHoverKey(null)}
            >
              3D Print Guide
            </Hotspot>
            <Hotspot
              as="a"
              className={styles.orderHotspot}
              href={ORDER_PRINT_URL}
              printKey="order"
              onPointerEnter={() => setPrintHoverKey("order")}
              onFocus={() => setPrintHoverKey("order")}
              onBlur={() => setPrintHoverKey(null)}
            >
              Order
            </Hotspot>
          </div>
        )}
      </div>

      <GalleryCarousel
        items={mobileEquipmentImages}
        activeIndex={equipmentSlide}
        onChange={setEquipmentSlide}
        className={styles.equipmentGallery}
        navClassName={styles.equipmentGalleryNavigator}
        label="equipment"
        imageBase={equipmentAsset}
        gapPercent={9.5}
      />
      <div className={styles.mobileEquipmentHotspots} aria-label="Equipment controls">
        <Hotspot as="a" className={styles.borrowEquipment} href={BORROW_ITEMS_URL} label="Borrow Equipment">
          Borrow Equipment
        </Hotspot>
      </div>

      <GalleryCarousel
        items={mobileEventCards}
        activeIndex={eventSlide}
        onChange={setEventSlide}
        className={styles.eventsGallery}
        navClassName={styles.eventsGalleryNavigator}
        label="events"
        imageBase={eventAsset}
        gapPercent={8}
        eventCards
      />

      <div className={styles.mobileFooterHotspots} aria-label="Footer links">
        <Hotspot as="a" className={styles.mobileFooterWhatsapp} href={MAKERSPACE_WHATSAPP_URL}>Whatsapp</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterDiscord} href={MAKERSPACE_DISCORD_URL}>Discord</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterEmail} href="mailto:su-makerspace@bath.ac.uk">Email</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterSu} href={MAKERSPACE_SU_URL}>SU</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterInstagram} href={MAKERSPACE_INSTAGRAM_URL}>Instagram</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterPrint} href={ORDER_PRINT_URL}>Print</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterAdmin} href={ADMIN_URL}>Admin</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterBorrow} href={BORROW_ITEMS_URL}>Borrow</Hotspot>
        <Hotspot as="a" className={styles.mobileFooterVolunteer} href={MAKERSPACE_VOLUNTEER_URL}>Volunteer</Hotspot>
      </div>
    </PageSection>
  );
}

export default function Home() {
  const [designOpen, setDesignOpen] = useState(false);
  const [equipmentSlide, setEquipmentSlide] = useState(0);
  const [eventSlide, setEventSlide] = useState(0);
  const [printHoverKey, setPrintHoverKey] = useState(null);
  const [siteNavOpen, setSiteNavOpen] = useState(false);
  const [navArrowContrast, setNavArrowContrast] = useState("dark");
  const isPhoneLayout = usePhoneLayout();

  function jumpToSection(section) {
    scrollToSection(section);
    setSiteNavOpen(false);
  }

  useEffect(() => {
    let frame = 0;

    function updateArrowContrast() {
      frame = 0;
      const toggle = document.querySelector("[data-nav-toggle]");
      if (!toggle) return;
      const rect = toggle.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const section = document
        .elementsFromPoint(x, y)
        .map((element) => element.closest?.("section[id]"))
        .find(Boolean);
      if (section?.id) {
        setNavArrowContrast(navContrastForSection(section.id));
      }
    }

    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(updateArrowContrast);
    }

    updateArrowContrast();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return (
    <main className={styles.page} data-layout={isPhoneLayout ? "phone" : "desktop"}>
      <Head>
        <title>Bath Makerspace</title>
        <meta
          name="description"
          content="University of Bath's student-run workshop for printing, equipment borrowing, volunteering, and makerspace events."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {!siteNavOpen && (
        <button
          type="button"
          className={styles.navToggle}
          data-nav-toggle=""
          data-contrast={navArrowContrast}
          aria-label={siteNavOpen ? "Close makerspace navigation" : "Open makerspace navigation"}
          aria-expanded={siteNavOpen}
          aria-controls="makerspace-fixed-nav"
          onClick={() => setSiteNavOpen((open) => !open)}
        >
          <NavbarToggleArrow />
        </button>
      )}
      <SiteNavOverlay
        open={siteNavOpen}
        onClose={() => setSiteNavOpen(false)}
        onSectionNavigate={jumpToSection}
      />

      {isPhoneLayout ? (
        <MobileMakerspaceContent
          designOpen={designOpen}
          setDesignOpen={setDesignOpen}
          equipmentSlide={equipmentSlide}
          setEquipmentSlide={setEquipmentSlide}
          eventSlide={eventSlide}
          setEventSlide={setEventSlide}
          printHoverKey={printHoverKey}
          setPrintHoverKey={setPrintHoverKey}
        />
      ) : (
        <>
      <PageSection id="home">
        <DesignPlate page="home" alt="Bath Makerspace" />
        <nav className={`${styles.homeHotspots} ${styles.homeButtonRow}`} aria-label="Makerspace page sections">
          {homeNavItems.map((item) => (
            <OutlineButton
              key={item.section}
              className={styles.homeOutlineButton}
              tone={item.tone}
              width={item.width}
              onClick={() => jumpToSection(item.section)}
              label={item.label}
            >
              {item.label}
            </OutlineButton>
          ))}
        </nav>
      </PageSection>

      <PageSection id="volunteer">
        <DesignPlate page="volunteer" alt="Volunteer with Bath Makerspace" />
        <div className={styles.volunteerHotspots}>
          <Hotspot as="a" className={styles.getInvolvedHotspot} href={MAKERSPACE_VOLUNTEER_URL}>
            Get Involved:
          </Hotspot>
          <Hotspot as="a" className={styles.volunteerEmailHotspot} href="mailto:su-makerspace@bath.ac.uk">
            su-makerspace@bath.ac.uk
          </Hotspot>
        </div>
      </PageSection>

      <PageSection id="print">
        <DesignPlate
          page={designOpen ? "printExpanded" : "printCollapsed"}
          alt="Print with Bath Makerspace"
        />
        <div
          className={styles.printHotspots}
          aria-label="Print menu controls"
          onPointerMove={(event) => {
            const item = event.target.closest("[data-print-key]");
            setPrintHoverKey(item?.dataset.printKey || null);
          }}
          onPointerLeave={() => setPrintHoverKey(null)}
        >
          <PrintHoverArrow activeKey={printHoverKey} />
          <Hotspot
            as="a"
            className={styles.collectHotspot}
            href={MY_BOOKINGS_URL}
            onPointerEnter={() => setPrintHoverKey(null)}
            onFocus={() => setPrintHoverKey(null)}
            onBlur={() => setPrintHoverKey(null)}
          >
            Collect
          </Hotspot>
          <Hotspot
            className={styles.designHotspot}
            onClick={() => setDesignOpen((open) => !open)}
            onPointerEnter={() => setPrintHoverKey(null)}
            onFocus={() => setPrintHoverKey(null)}
            onBlur={() => setPrintHoverKey(null)}
            controls="design-print-menu"
            expanded={designOpen}
          >
            Design
          </Hotspot>
          {designOpen && (
            <div id="design-print-menu">
              <Hotspot
                as="a"
                className={styles.courseHotspot}
                href={CS_COURSE_URL}
                printKey="course"
                onPointerEnter={() => setPrintHoverKey("course")}
                onFocus={() => setPrintHoverKey("course")}
                onBlur={() => setPrintHoverKey(null)}
              >
                CS Course
              </Hotspot>
              <Hotspot
                as="a"
                className={styles.guideHotspot}
                href={PRINT_GUIDE_URL}
                printKey="guide"
                onPointerEnter={() => setPrintHoverKey("guide")}
                onFocus={() => setPrintHoverKey("guide")}
                onBlur={() => setPrintHoverKey(null)}
              >
                3D Print Guide
              </Hotspot>
              <Hotspot
                as="a"
                className={styles.orderHotspot}
                href={ORDER_PRINT_URL}
                printKey="order"
                onPointerEnter={() => setPrintHoverKey("order")}
                onFocus={() => setPrintHoverKey("order")}
                onBlur={() => setPrintHoverKey(null)}
              >
                Order
              </Hotspot>
            </div>
          )}
        </div>
      </PageSection>

      <PageSection id="equipment" data-slide={equipmentSlide}>
        <DesignPlate page="equipment" alt="Bath Makerspace equipment" />
        <GalleryCarousel
          items={equipmentImages}
          activeIndex={equipmentSlide}
          onChange={setEquipmentSlide}
          className={styles.equipmentGallery}
          navClassName={styles.equipmentGalleryNavigator}
          label="equipment"
          imageBase={equipmentAsset}
          gapPercent={3.65}
        />
        <div className={styles.equipmentHotspots} aria-label="Equipment controls">
          <Hotspot as="a" className={styles.borrowEquipment} href={BORROW_ITEMS_URL} label="Borrow Equipment">
            Borrow Equipment
          </Hotspot>
        </div>
        <output className={styles.stateReadout} aria-live="polite">
          Equipment slide {equipmentSlide + 1}
        </output>
      </PageSection>

      <PageSection id="events" data-slide={eventSlide}>
        <DesignPlate page="events" alt="Bath Makerspace events" />
        <GalleryCarousel
          items={eventCards}
          activeIndex={eventSlide}
          onChange={setEventSlide}
          className={styles.eventsGallery}
          navClassName={styles.eventsGalleryNavigator}
          label="events"
          imageBase={eventAsset}
          gapPercent={3.1}
          eventCards
        />
        <output className={styles.stateReadout} aria-live="polite">
          Events slide {eventSlide + 1}
        </output>
      </PageSection>

      <PageSection id="footer" className={styles.footerSection}>
        <DesignPlate page="footer" alt="Bath Makerspace links" />
        <img className={styles.footerLogo} src="/makerspace-design/assets/footer-logo.png" alt="" aria-hidden="true" />
        <nav className={`${styles.footerHotspots} ${styles.footerNativeNav}`} aria-label="Footer links">
          <div className={`${styles.footerTextColumn} ${styles.footerTextColumnLeft}`}>
            {footerLeftLinks.map((item) => (
              <FooterTextLink key={item.label} item={item} />
            ))}
          </div>
          <div className={`${styles.footerTextColumn} ${styles.footerTextColumnRight}`}>
            {footerRightLinks.map((item) => (
              <FooterTextLink key={item.label} item={item} />
            ))}
          </div>
        </nav>
      </PageSection>
        </>
      )}
    </main>
  );
}
