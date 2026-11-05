import { initShopIntro } from './shop-intro';

function bootShopIntro() {
  const head = document.querySelector<HTMLElement>('[data-shop-head]');
  if (!head || head.dataset.shopIntroBound === '1') return;
  head.dataset.shopIntroBound = '1';
  initShopIntro(head);
}

bootShopIntro();
document.addEventListener('astro:page-load', bootShopIntro);
