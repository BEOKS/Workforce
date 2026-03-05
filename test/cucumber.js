module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: [
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: ['features/**/*.feature'],
    format: [
      'progress-bar',
      'summary',
      'json:reports/cucumber-report.json'
    ],
    publishQuiet: true,
    parallel: 1
  }
};
