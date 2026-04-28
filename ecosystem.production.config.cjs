module.exports = {
  apps: [
    {
      name: "boiaro-api",
      cwd: "./server",
      script: "dist/index.js",
      interpreter: "node",
      env_production: {
        NODE_ENV: "production",
        PORT: 3001
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
