module.exports = {
  apps: [
    {
      name: "boiaro-api",
      cwd: "./server",
      script: "dist/index.js",
      interpreter: "node",
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
        // Defense-in-depth alongside lib/timezone.ts's explicit UTC+6 math —
        // without this, any code that still uses raw Date getters (new
        // Date().getHours() etc.) silently reads the host OS's timezone
        // instead of Dhaka.
        TZ: "Asia/Dhaka"
      }
    },
    {
      name: "boiaro-web",
      cwd: ".",
      script: "npm",
      args: "run preview -- --host 127.0.0.1 --port 8080",
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
