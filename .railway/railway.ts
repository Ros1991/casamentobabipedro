// Infraestrutura do projeto no Railway (substitui o antigo railway.json).
// Ver: railway config plan / railway config apply
import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  // Banco SQLite (galera.db) e fotos (uploads/) ficam neste volume, montado em /data.
  const galeraVolume = volume("galera-data", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "us-east4-eqdc4a",
    sizeMB: 50000,
  });

  const galera = service("galera", {
    source: github("Ros1991/casamentobabipedro", { checkSuites: false }),
    // Virgínia: menor latência para o Brasil entre as regiões disponíveis
    replicas: { "us-east4": 1 },
    healthcheck: "/health",
    healthcheckTimeout: 120,
    volumeMounts: { "/data": galeraVolume },
    env: {
      PORT: "3000",
      NODE_ENV: "production",
      DATA_DIR: "/data",
      MAX_UPLOAD_MB: "12",
      PUBLIC_URL: "https://galera-production-e5fd.up.railway.app",
      VAPID_SUBJECT: "https://galera-production-e5fd.up.railway.app",
      // Segredos e códigos ficam só no Railway (Variables), nunca no repositório
      SESSION_SECRET: preserve(),
      INVITE_CODE: preserve(),
      ADMIN_PHONES: preserve(),
      TELAO_CODE: preserve(),
      VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
    },
  });

  return project("galera-babi-pedro", {
    resources: [galera, galeraVolume],
  });
});
