module.exports = {
  extends: ["next/core-web-vitals", "plugin:security/recommended-legacy", "plugin:sonarjs/recommended-legacy"],
  rules: {
    "sonarjs/no-duplicate-string": "off",
    "sonarjs/no-nested-conditional": "off",
    "sonarjs/no-redundant-assignments": "off",
    "sonarjs/unused-import": "off",
    "sonarjs/no-unused-vars": "off",
    "sonarjs/no-dead-store": "off",
    "sonarjs/cognitive-complexity": "off",
    "sonarjs/no-nested-template-literals": "off",
    "security/detect-object-injection": "off",
    "security/detect-non-literal-fs-filename": "off",
  },
  ignorePatterns: ["node_modules", ".next", "dist", "coverage", "playwright-report"],
};
