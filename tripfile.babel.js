import trip from 'trip';

const preprocess = trip()
  .via('sass', {
    loadPaths: 'bower_components'
  })
  .via('autoprefixer', [
    'ie >= 8', 'ff >= 30', 'chrome >= 34',
    'iOS >= 7', 'Safari >= 7',
  ])
  .via('babel')
  .via('browserify', {
    transform: ['debowerify']
  })
;

// const optimise = trip()
//   .via('concat')
//   .via('cssnano')
//   .via('uglify')
//   .via('inline', '3KB')
//   .via('minify-html')
//   .via('imagemin')
//   .via('rev')
//   .via('sw-precache')
// ;

export function build() {
  return trip()
    .via(preprocess)
    // .via(optimise)
    .build('client/**', 'dist');
}

export function serve() {
  return preprocess.build('client/**', 'stage', true);
}
