// Configure a distribuição da extensão. Origens de destinos são exclusivas de homologação.
globalThis.OctorEnvironment = Object.freeze({
  appOrigins: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  frontendOrigin: 'http://localhost:4200',
  apiBase: 'http://localhost:8000/api',
  playbackTestOrigins: [],
});
