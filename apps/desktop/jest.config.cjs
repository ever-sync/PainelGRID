module.exports = {
  clearMocks: true,
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2020",
          module: "CommonJS",
          esModuleInterop: true,
          jsx: "react-jsx",
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};
