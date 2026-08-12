(() => {
  const freeze = Object.freeze;

  window.MoguriaConfig = freeze({
    version: '3.2.1-battle-v3',
    saveVersion: 3,
    debug: false,

    performance: freeze({
      targetFps: 60,
      lowFps: 42,
      mediumFps: 53,
      criticalFps: 34,
      maxParticles: 170,
      maxProjectiles: 88,
      maxDrops: 130,
      maxFx: 86,
      checkpointSeconds: 20,
      rendererDprMax: 2,
      adaptiveEffects: true
    }),

    assets: freeze({
      manifest: 'assets/manifest.json',
      criticalBudgetMB: 4,
      lazyLoad: true,
      registerServiceWorker: false,
      cleanupOldServiceWorker: true
    }),

    map: freeze({
      minX: -760,
      maxX: 760,
      minY: -760,
      maxY: 760
    }),

    run: freeze({
      maxWave: 12,
      rerolls: 3,
      artifactRerolls: 3,
      timeLimit: 480
    }),

    exp: freeze({
      base: 16,
      power: 1.55,
      scale: 8,
      discountRate: 0.72
    }),

    combat: freeze({
      attackRange: 245,
      attackAnimationSeconds: 0.62,
      summonRange: 275,
      rareArrowPadding: 34,
      lightningStartRange: 320,
      lightningChainRange: 175,
      lightningPlayerLimit: 390
    }),

    collectAll: freeze({
      minWaveGap: 2,
      maxWaveGap: 4,
      minTriggerRatio: 0.35,
      maxTriggerRatio: 0.70
    }),

    belly: freeze({
      max: 3,
      recoveryMinutes: 45
    }),

    storage: freeze({
      key: 'moguria.save.v2',
      legacyKeys: ['moguria.prototype.save.v1'],
      backupPrefix: 'moguria.backup.',
      corruptPrefix: 'moguria.corrupt.'
    }),

    security: freeze({
      devToolsEnabled: true,
      validateImportedSave: true,
      maxRunLog: 20,
      allowDevToolsOnHosts: ['localhost', '127.0.0.1', '']
    }),

    viewport: freeze({
      designWidth: 390,
      designHeight: 844,
      minGameplayWidth: 320,
      maxGameplayWidth: 820,
      safeArea: true
    })
  });
})();
