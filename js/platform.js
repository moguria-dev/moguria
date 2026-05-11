window.MoguriaPlatform = (() => {
  function init(){
    document.documentElement.style.setProperty('--vh', `${innerHeight*0.01}px`);
    addEventListener('resize',()=>document.documentElement.style.setProperty('--vh', `${innerHeight*0.01}px`));
    document.body.classList.toggle('wide', innerWidth > 820);
    addEventListener('resize',()=>document.body.classList.toggle('wide', innerWidth > 820));
  }
  return { init };
})();
