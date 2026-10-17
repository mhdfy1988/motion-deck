import globals from 'globals';

// 先守住正式源码的引用正确性，不把风格、实验代码或生成产物混进门禁。
const rules = {
  'no-undef': 'error',
  'no-unused-vars': [
    'error',
    {
      args: 'none',
      caughtErrors: 'none',
      ignoreRestSiblings: true,
    },
  ],
};

export default [
  {
    ignores: [
      '**/*.bundle.*',
      '**/*.generated.*',
      'desktop/licenses/**',
      'web/labs/motion/fullbody.js',
      'web/labs/motion/fullbody-rig.js',
      'web/labs/motion/free-view.js',
    ],
  },
  {
    files: ['web/labs/motion/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
    rules,
  },
  {
    files: ['desktop/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules,
  },
];
