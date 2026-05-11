window.MoguriaConfig = Object.freeze({
  version: '2.5.0',
  saveVersion: 2,
  debug: false,
  performance: Object.freeze({ targetFps: 60, lowFps: 42, mediumFps: 53, criticalFps: 34, maxParticles: 170, maxProjectiles: 88, maxDrops: 130, maxFx: 86, adaptiveEffects: true }),
  assets: Object.freeze({ manifest: 'assets/manifest.json', criticalBudgetMB: 2, lazyLoad: true, registerServiceWorker: true }),
  map: Object.freeze({ minX: -760, maxX: 760, minY: -760, maxY: 760 }),
  run: Object.freeze({ maxWave: 12, rerolls: 3, timeLimit: 480 }),
  exp: Object.freeze({ base: 16, power: 1.55, scale: 8, discountRate: 0.72 }),
  combat: Object.freeze({ attackRange: 245, summonRange: 275, rareArrowPadding: 34, lightningStartRange: 320, lightningChainRange: 175, lightningPlayerLimit: 390 }),
  belly: Object.freeze({ max: 3, recoveryMinutes: 45 }),
  storage: Object.freeze({ key: 'moguria.save.v2', legacyKeys: ['moguria.prototype.save.v1'], backupPrefix: 'moguria.backup.' }),
  security: Object.freeze({ devToolsEnabled: true, validateImportedSave: true, maxRunLog: 20 }),
  viewport: Object.freeze({ designWidth: 390, designHeight: 844, minGameplayWidth: 320, maxGameplayWidth: 820, safeArea: true })
});
