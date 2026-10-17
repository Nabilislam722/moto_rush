// The OP "#27" dirt bike: vector art drawn in the game so its wheels can spin separately.
// Body and wheels are SVG in a 1000px frame (wheel radius 150); the game draws them at 1 frame px = 0.2 sheet px.
(function (root) {
  const O = '#1c1a2e', PURPLE = '#7b3fe4', PURPLE_D = '#5a2bb5', LIME = '#a3e635', LIME_D = '#7cc21c';
  const BLACK = '#27242f', STEEL = '#cfd0dc', GOLD = '#e0b03a';

  const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 195 890 565" width="356" height="226">
  <g stroke="${O}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- rear shock -->
    <path d="M338 402 L392 498" stroke="${O}" stroke-width="30" fill="none"/>
    <path d="M338 402 L392 498" stroke="${PURPLE}" stroke-width="20" stroke-dasharray="7 5" fill="none"/>
    <!-- swingarm, chain and rear sprocket -->
    <path d="M232 572 L458 528 L468 562 L240 612 Z" fill="${STEEL}"/>
    <path d="M236 542 L482 524 M236 638 L482 568" stroke="${O}" stroke-width="14" fill="none"/>
    <path d="M236 542 L482 524 M236 638 L482 568" stroke="#8d8a9c" stroke-width="7" stroke-dasharray="6 5" fill="none"/>
    <circle cx="235" cy="590" r="48" fill="${PURPLE}"/>
    <g fill="${PURPLE_D}" stroke-width="4">${[0, 72, 144, 216, 288].map(a => `<circle cx="${235 + Math.cos(a * Math.PI / 180) * 26}" cy="${590 + Math.sin(a * Math.PI / 180) * 26}" r="8"/>`).join('')}</g>
    <!-- frame -->
    <path d="M640 300 L602 430 L520 472 L458 545 L472 632 L582 642 L618 562 L602 430" fill="none" stroke="${O}" stroke-width="32"/>
    <path d="M640 300 L602 430 L520 472 L458 545 L472 632 L582 642 L618 562 L602 430" fill="none" stroke="${PURPLE}" stroke-width="20"/>
    <!-- engine -->
    <path d="M472 440 L610 436 L616 606 L474 614 Z" fill="${BLACK}"/>
    <g stroke="#55526a" stroke-width="5">${[458, 474, 490, 506, 522].map(y => `<path d="M496 ${y} L596 ${y - 2}" fill="none"/>`).join('')}</g>
    <circle cx="548" cy="562" r="42" fill="#3a3746"/>
    <circle cx="548" cy="562" r="26" fill="#55526a" stroke-width="4"/>
    <circle cx="538" cy="552" r="7" fill="#d8d6e6" stroke="none"/>
    <circle cx="482" cy="546" r="18" fill="${PURPLE}"/>
    <!-- side panel with the number -->
    <path d="M198 368 L472 368 L458 440 L392 478 L232 422 Z" fill="${BLACK}"/>
    <ellipse cx="388" cy="420" rx="54" ry="34" fill="${LIME}"/>
    <text x="388" y="437" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="46" fill="${O}" stroke="none">27</text>
    <!-- tail and seat -->
    <path d="M76 312 L198 338 L200 374 L92 346 Z" fill="${BLACK}"/>
    <path d="M98 324 L184 342" stroke="${LIME}" stroke-width="10" fill="none"/>
    <path d="M184 338 Q352 316 548 332 L548 364 Q352 374 196 376 Z" fill="${BLACK}"/>
    <!-- tank with stripes -->
    <path d="M504 330 L640 288 L670 360 L602 422 L514 406 Z" fill="${LIME}"/>
    <path d="M560 316 L586 308 L562 412 L538 409 Z" fill="${PURPLE}" stroke-width="4"/>
    <path d="M600 303 L616 298 L592 414 L576 414 Z" fill="${PURPLE}" stroke-width="4"/>
    <path d="M612 346 L640 334 M618 362 L644 350" stroke="${O}" stroke-width="4" fill="none"/>
    <!-- fork -->
    <path d="M628 236 L776 590" stroke="${O}" stroke-width="34" fill="none"/>
    <path d="M628 236 L776 590" stroke="${BLACK}" stroke-width="24" fill="none"/>
    <path d="M716 470 L768 575" stroke="${O}" stroke-width="30" fill="none"/>
    <path d="M716 470 L768 575" stroke="${GOLD}" stroke-width="20" fill="none"/>
    <rect x="628" y="282" width="46" height="22" rx="5" fill="${PURPLE}" transform="rotate(22 651 293)"/>
    <rect x="690" y="420" width="44" height="22" rx="5" fill="${PURPLE}" transform="rotate(22 712 431)"/>
    <!-- front plate and fender -->
    <path d="M668 246 L706 238 L722 318 L692 386 L672 380 Z" fill="${LIME}"/>
    <path d="M688 262 L702 330" stroke="${LIME_D}" stroke-width="6" fill="none"/>
    <path d="M640 396 Q800 356 942 432 L930 452 Q800 392 652 418 Z" fill="${LIME}"/>
    <!-- handlebar -->
    <path d="M614 232 L628 250" stroke="${O}" stroke-width="18" fill="none"/>
    <path d="M548 216 L614 232" stroke="${O}" stroke-width="20" fill="none"/>
    <path d="M548 216 L614 232" stroke="${PURPLE}" stroke-width="11" fill="none"/>
    <path d="M548 216 L568 221" stroke="${BLACK}" stroke-width="14" fill="none"/>
    <path d="M566 228 L590 246" stroke="${O}" stroke-width="6" fill="none"/>
  </g></svg>`;

  // Knobby tyre with wire spokes; the front adds a brake disc.
  const wheel = front => {
    const knobs = Array.from({ length: 30 }, (_, i) => {
      const a = i * 12;
      return `<rect x="-11" y="-156" width="22" height="18" rx="4" transform="rotate(${a})"/>`;
    }).join('');
    const spokes = Array.from({ length: 18 }, (_, i) => {
      const a = i * 20 * Math.PI / 180, b = a + 0.5;
      return `<path d="M${Math.cos(a) * 20} ${Math.sin(a) * 20} L${Math.cos(b) * 100} ${Math.sin(b) * 100}"/>`;
    }).join('');
    const disc = front
      ? `<circle r="62" fill="#dcdce6" stroke="${O}" stroke-width="5"/>` +
        Array.from({ length: 10 }, (_, i) => { const a = i * 36 * Math.PI / 180; return `<circle cx="${Math.cos(a) * 46}" cy="${Math.sin(a) * 46}" r="6" fill="#9a98aa"/>`; }).join('')
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-160 -160 320 320" width="128" height="128">
      <g fill="${BLACK}" stroke="${O}" stroke-width="5">${knobs}</g>
      <circle r="142" fill="${BLACK}" stroke="${O}" stroke-width="6"/>
      <circle r="116" fill="#34313f"/>
      <circle r="104" fill="none" stroke="${STEEL}" stroke-width="9"/>
      <g stroke="#b6b4c6" stroke-width="3.5">${spokes}</g>
      ${disc}
      <circle r="28" fill="${PURPLE}" stroke="${O}" stroke-width="5"/>
      <circle r="9" fill="${O}"/>
    </svg>`;
  };

  const toImage = svg => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Could not draw the OP bike'));
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });

  root.MotoOpBike = {
    load: () => Promise.all([toImage(body), toImage(wheel(false)), toImage(wheel(true))])
      .then(([b, r, f]) => ({ bike5: b, wheel5: r, wheel5f: f })),
  };
})(typeof self !== 'undefined' ? self : this);
