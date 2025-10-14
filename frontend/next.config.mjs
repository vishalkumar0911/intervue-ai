/** @type {import('next').NextConfig} */
const config = {
  // Monorepo: tell Next where your root is so file tracing doesn’t guess
  outputFileTracingRoot: process.cwd(), // C:\interviewer\intervue-ai
  // (optional) keep the default cache dir
  // distDir: '.next',
};

export default config;
