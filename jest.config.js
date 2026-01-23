module.exports = {
  testMatch: [
    "<rootDir>/tests/**/*.test.ts"
  ],
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.json" }]
  }
};
