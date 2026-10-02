// Shared page stabilization before screenshots and layout measurements:
// waits for fonts, freezes animations and transitions, then scrolls the full
// page and back so lazy images load.
export async function stabilize(page) {
  // Wait for fonts to be ready before any layout-sensitive capture.
  await page.evaluate(() => document.fonts.ready);

  // Freeze animations and transitions for stable screenshots.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });

  // Trigger lazy images by scrolling to the bottom and back to the top.
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let y = 0;
      const step = () => {
        window.scrollTo(0, y);
        y += 400;
        if (y < document.body.scrollHeight) {
          requestAnimationFrame(step);
        } else {
          window.scrollTo(0, 0);
          setTimeout(resolve, 300);
        }
      };
      step();
    });
  });
}
