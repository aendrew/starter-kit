import browserify from 'browserify';
import browserSync from 'browser-sync';
import del from 'del';
import gulp from 'gulp';
import mergeStream from 'merge-stream';
import path from 'path';
import runSequence from 'run-sequence';
import source from 'vinyl-source-stream';
import subdir from 'subdir';
import vinylBuffer from 'vinyl-buffer';
import watchify from 'watchify';
import AnsiToHTML from 'ansi-to-html';

import yaml from 'js-yaml';
import _ from 'lodash';
import fs from 'fs';
import glob from 'glob';
import nunjucks from 'nunjucks';
import matter from 'gray-matter';
import markdown from './__builder/markdown';
import mkdirp from 'mkdirp';
import d3 from 'd3';

const $ = require('auto-plug')('gulp');
const ansiToHTML = new AnsiToHTML();

const AUTOPREFIXER_BROWSERS = [
  'ie >= 8',
  'ff >= 30',
  'chrome >= 34',
  'iOS >= 7',
  'Safari >= 7'
];

const BROWSERIFY_ENTRIES = [
  'scripts/main.js',
];

const BROWSERIFY_TRANSFORMS = [
  'babelify',
  'debowerify',
];

const OTHER_SCRIPTS = [
  'scripts/top.js'
];

let env = 'development';

// function to get an array of objects that handle browserifying
function getBundlers(useWatchify) {
  return BROWSERIFY_ENTRIES.map(entry => {
    var bundler = {
      b: browserify(path.posix.resolve('client', entry), {
        cache: {},
        packageCache: {},
        fullPaths: useWatchify,
        debug: useWatchify
      }),

      execute: function () {
        var stream = this.b.bundle()
          .on('error', function (error) {
            handleBuildError.call(this, 'Error building JavaScript', error);
          })
          .pipe(source(entry.replace(/\.js$/, '.bundle.js')));

        // skip sourcemap creation if we're in 'serve' mode
        if (useWatchify) {
          stream = stream
            .pipe(vinylBuffer())
            .pipe($.sourcemaps.init({loadMaps: true}))
            .pipe($.sourcemaps.write('./'));
        }

        return stream.pipe(gulp.dest('.tmp'));
      }
    };

    // register all the transforms
    BROWSERIFY_TRANSFORMS.forEach(function (transform) {
      bundler.b.transform(transform);
    });

    // upgrade to watchify if we're in 'serve' mode
    if (useWatchify) {
      bundler.b = watchify(bundler.b);
      bundler.b.on('update', function (files) {
        // re-run the bundler then reload the browser
        bundler.execute().on('end', reload);

        // also report any linting errors in the changed file(s)
        gulp.src(files.filter(file => subdir(path.resolve('client'), file))) // skip bower/npm modules
          .pipe($.eslint())
          .pipe($.eslint.format());
      });
    }

    return bundler;
  });
}

// compresses images (client => dist)
gulp.task('images', () => gulp.src('client/**/*.{jpg,png,gif,svg}')
  .pipe($.imagemin({
    progressive: true,
    interlaced: true,
  }))
  .pipe(gulp.dest('dist'))
);

// copies over miscellaneous files (client => dist)
gulp.task('copy', () => gulp.src(
  OTHER_SCRIPTS.concat([
    'client/**/*',
    '!client/**/*.{html,scss,js,jpg,png,gif,svg}', // all handled by other tasks
  ]), {dot: true})
  .pipe(gulp.dest('dist'))
);

// minifies all HTML, CSS and JS (.tmp & client => dist)
gulp.task('html', done => {
  const assets = $.useref.assets({
    searchPath: ['.tmp', 'client', '.'],
  });

  gulp.src('client/**/*.html')
    .pipe(assets)
    .pipe($.if('*.js', $.uglify({output: {inline_script: true}}))) // eslint-disable-line camelcase
    .pipe($.if('*.css', $.minifyCss({compatibility: '*'})))
    .pipe(assets.restore())
    .pipe($.useref())
    .pipe(gulp.dest('dist'))
    .on('end', () => {
      gulp.src('dist/**/*.html')
        .pipe($.smoosher())
        .pipe($.minifyHtml())
        .pipe(gulp.dest('dist'))
        .on('end', done);
    });
});

// clears out the dist and .tmp folders
gulp.task('clean', del.bind(null, ['.tmp', 'dist/*', '!dist/.git'], {dot: true}));

// // runs a development server (serving up .tmp and client)
gulp.task('serve', ['styles'], function (done) {
  var bundlers = getBundlers(true);

  // execute all the bundlers once, up front
  var initialBundles = mergeStream(bundlers.map(function (bundler) {
    return bundler.execute();
  }));
  initialBundles.resume(); // (otherwise never emits 'end')

  initialBundles.on('end', function () {
    // use browsersync to serve up the development app
    browserSync({
      // notify: false,
      server: {
        baseDir: ['.tmp', 'client'],
        routes: {
          '/bower_components': 'bower_components'
        }
      }
    });

    // refresh browser after other changes
    gulp.watch(['client/**/*.html'], reload);
    gulp.watch(['client/styles/**/*.{scss,css}'], ['styles', /*'scsslint',*/ reload]);
    gulp.watch(['client/images/**/*'], reload);

    done();
  });
});

// builds and serves up the 'dist' directory
gulp.task('serve:dist', ['default'], done => {
  require('browser-sync').create().init({
    open: false,
    notify: false,
    server: 'dist',
  }, done);
});

// task to do a straightforward browserify bundle (build only)
gulp.task('scripts', function () {
  return mergeStream(getBundlers().map(function (bundler) {
    return bundler.execute();
  }));
});

// builds stylesheets with sass/autoprefixer
gulp.task('styles', () => gulp.src('client/**/*.scss')
  .pipe($.sourcemaps.init())
  .pipe($.sass({includePaths: 'bower_components'})
    .on('error', function (error) {
      handleBuildError.call(this, 'Error building Sass', error);
    })
  )
  .pipe($.autoprefixer({browsers: AUTOPREFIXER_BROWSERS}))
  .pipe($.sourcemaps.write('./'))
  .pipe(gulp.dest('.tmp'))
);

// lints JS files
gulp.task('eslint', () => gulp.src('client/scripts/**/*.js')
  .pipe($.eslint())
  .pipe($.eslint.format())
  .pipe($.if(env === 'production', $.eslint.failAfterError()))
  );

gulp.task('about', done => {

  if (!process.env.npm_package_repository_url) {
    console.error('No repository in the package.json');
    return;
  }

  require('child_process').exec('(`which echo` -n "$npm_package_repository_url#"; git rev-parse --verify --short HEAD) > dist/about.txt', done);

});

// sets up watch-and-rebuild for JS and CSS
gulp.task('watch', done => {
  runSequence('clean', ['scripts', 'styles'], () => {
    gulp.watch('./client/**/*.scss', ['styles'/*, 'scsslint'*/]);
    gulp.watch('./client/**/*.{js,hbs}', ['scripts', 'eslint']);
    done();
  });
});

// makes a production build (client => dist)
gulp.task('default', done => {
  env = 'production';

  runSequence(
    ['clean', /*'scsslint',*/ 'eslint'],
    ['scripts', 'styles', 'copy'],
    ['html', 'images'],
  done);
});

// helpers
let preventNextReload; // hack to keep a BS error notification on the screen
function reload() {
  if (preventNextReload) {
    preventNextReload = false;
    return;
  }

  browserSync.reload();
}

function handleBuildError(headline, error) {
  if (env === 'development') {
    // show in the terminal
    $.util.log(headline, error && error.stack);

    // report it in browser sync
    let report = `<span style="color:red;font-weight:bold;font:bold 20px sans-serif">${headline}</span>`;
    if (error) report += `<pre style="text-align:left;max-width:800px">${ansiToHTML.toHtml(error.stack)}</pre>`;
    browserSync.notify(report, 60 * 60 * 1000);
    preventNextReload = true;

    // allow the sass/js task to end successfully, so the process can continue
    this.emit('end');
  }
  else throw error;
}

function get_filters(theme_dir) {
  const dir = path.join(process.cwd(), theme_dir, 'filters');
  return glob.sync('**/*.js', { cwd: dir })
  .map(path.parse)
  .reduce((d, details) => {
    const fullpath = path.resolve(dir, details.dir, details.base);
    const js = require(fullpath);
    const is_single_function = !Object.keys(js).length && typeof js === 'function';
    const object_path = [
      details.dir.replace(/\/+/g, '.').replace(/\-+/g, '_'),
      details.name.replace(/[\-\s]+/g, '_')
    ].filter(Boolean).join('_');
    if (is_single_function) {
      d[object_path] = js;
    } else {
      for (let key in js) {
        if (js.hasOwnProperty(key) && typeof js[key] === 'function') {
          d[object_path + '_' + key] = js[key];
        }
      }
    }
    return d;
    }, {});

}

function get_config(theme_dir) {

  const cwd = process.cwd();
  const dir = path.join(cwd, theme_dir, 'config');

  return glob.sync('**/*.{js,yaml,yml,json}', { cwd: dir })
    .map(path.parse)
    .map(d => {
      d.depth = !d.dir ? 0 : (d.dir.match(/\//g) || []).length + 1;
      return d
    })
    // sort by depth. top level first, nested directories last
    .sort((a, b) => b.depth - a.depth)
    // bring index files to the top of the list so they can be processed first
    .sort((a,b) => a.name === 'index' ? (b.name === 'index' ? a.depth - b.depth : -1) : 1)
    // .map(d=> { console.dir(d);return d})
    .reduce((d, details) => {
      let o = {};
      const fullpath = path.resolve(dir, details.dir, details.base);
      const object_path = [
        details.dir.replace(/\/+/g, '.').replace(/\-+/g, '_'),
        details.name === 'index' ? null : details.name.replace(/[\-\s]+/g, '_')
      ].filter(Boolean).join('.');

      if (details.ext === '.yaml' || details.ext === '.yml') {
        o = yaml.load(fs.readFileSync(fullpath, 'utf8'))
      } else if (details.ext === '.js' || details.ext === '.json') {
        o = require(fullpath);
      }
      return object_path ? _.set(d, object_path, o) : _.merge(d, o);
    }, {});
}

const ContentLoader = nunjucks.Loader.extend({
  init: function (map, opts) {
    this.files = map || {};
  },

  getSource: function (name) {
    if (!name || !this.files[name]) {
      return null;
    }

    return {
      src: this.files[name].content,
      path: name,
      noCache: true
    };
  }
});

/*
var FileSystemLoader = Loader.extend({
    init: function(searchPaths, opts) {
        if(typeof opts === 'boolean') {
            console.log(
                '[nunjucks] Warning: you passed a boolean as the second ' +
                'argument to FileSystemLoader, but it now takes an options ' +
                'object. See http://mozilla.github.io/nunjucks/api.html#filesystemloader'
            );
        }

        opts = opts || {};
        this.pathsToNames = {};
        this.noCache = !!opts.noCache;

        if(searchPaths) {
            searchPaths = lib.isArray(searchPaths) ? searchPaths : [searchPaths];
            // For windows, convert to forward slashes
            this.searchPaths = searchPaths.map(path.normalize);
        }
        else {
            this.searchPaths = ['.'];
        }

        if(opts.watch) {
            // Watch all the templates in the paths and fire an event when
            // they change
            var paths = this.searchPaths.filter(function(p) { return existsSync(p); });
            var watcher = chokidar.watch(paths);
            var _this = this;
            watcher.on('all', function(event, fullname) {
                fullname = path.resolve(fullname);
                if(event === 'change' && fullname in _this.pathsToNames) {
                    _this.emit('update', _this.pathsToNames[fullname]);
                }
            });
            watcher.on('error', function(error) {
                console.log('Watcher error: ' + error);
            });
        }
    },

    getSource: function(name) {
        var fullpath = null;
        var paths = this.searchPaths;

        for(var i=0; i<paths.length; i++) {
            var basePath = path.resolve(paths[i]);
            var p = path.resolve(paths[i], name);

            // Only allow the current directory and anything
            // underneath it to be searched
            if(p.indexOf(basePath) === 0 && existsSync(p)) {
                fullpath = p;
                break;
            }
        }

        if(!fullpath) {
            return null;
        }

        this.pathsToNames[fullpath] = name;

        return { src: fs.readFileSync(fullpath, 'utf-8'),
                 path: fullpath,
                 noCache: this.noCache };
    }
});
*/

const properties_format_options = { sections: true, namespaces: true, variables: true };

matter.parsers.properties = function(str, opts) {
  try {
    var props = matter.parsers.requires.properties || (matter.parsers.requires.properties = require('properties'));
    return props.parse(str, properties_format_options);
  } catch (err) {
    if (opts.strict) {
      throw new SyntaxError('gray-matter parser [Properties]: ' + err);
    } else {
      return {};
    }
  }
};

const dir = {
  theme: '__theme',
  custom_theme: 'theme',
  content: 'content'
};

const load_order = [
  dir.custom_theme,
  dir.theme
];

gulp.task('templates', () => {

  const content_loader = new ContentLoader();
  const env = new nunjucks.Environment([
    content_loader,
    new nunjucks.FileSystemLoader(load_order)
  ]);

  env.addGlobal('_', _);
  env.addGlobal('d3', d3);

  function load(dir) {

    const config = get_config(dir);

    function customizer(existing, srcValue) {
      if (_.isArray(existing) || _.isArray(srcValue)) {
        existing = _.isArray(existing) ? existing : _.isArray(srcValue) ? [existing] : [];
        if (srcValue[0] === '...') {
          return existing.concat(srcValue.slice(1));
        } else if (srcValue[srcValue.length - 1] === '...') {
          return srcValue.slice(0, srcValue.length - 1).concat(existing);
        }
        return srcValue;
      }
    }

    console.dir(config);

    for (let key in config) {
      if (config.hasOwnProperty(key)) {
        let existing = false;
        try {
          existing = env.getGlobal(key);
        } catch (e) { }
        if (existing && _.isPlainObject(existing)) {
          env.addGlobal(key, _.mergeWith(existing, config[key], customizer));
        } else {
          env.addGlobal(key, config[key]);
        }
      }
    }

    const filters = get_filters(dir);
    for (let key in filters) {
      if (filters.hasOwnProperty(key)) {
        env.addFilter(key, filters[key]);
      }
    }
  }

  var i = load_order.length;

  while (i--) {
    load(load_order[i]);
  }

  content_loader.files = glob.sync('**/*.{md,markdown,html}', { cwd: dir.content })
    .map(path.parse)
    // sort html files last so they take precedence over markdown (see reduce below)
    // eg in case we have both myfile.md and myfile.html, we'll ignore the former.
    .sort((a, b) => a.ext === '.html' && b.ext === '.html' ? 0 : (a.ext !== '.html' ? -1 : 1))
    .reduce((index, f) => {
      f.id = path.join(f.dir, f.name + f.ext); 
      f.target_dir = path.join(__dirname, '.tmp', f.dir);
      f.target_path = path.join(f.target_dir, f.name + '.html');
      index[f.id] = f;
      return index;
    }, {});

  let files = _.values(content_loader.files)
    .map(f => {
      const fm = matter.read(path.resolve(dir.content, f.dir, f.base));
      f.content = f.raw_content = fm.content.trim();
      f.data = fm.data;
      console.log('Register', f.id)
      return f;
    })
    .map(f => {
      if (f.ext !== '.md' && f.ext !== '.markdown') return f;
      console.log('preprocess', f.id);
      f.content = '{% filter markdown %}' + env.render(f.id, f.data) + '\n{% endfilter %}';
      return f;
    })
    .map(f => {

      console.log('create template', f.id);
      let content = f.content;
      let layout;
      let block;

      try { layout = f.data.layout || env.getGlobal('layout'); } catch (e) {}
      try { block = f.data.block || env.getGlobal('block'); } catch (e) { }

      if (block) {
        content = '{% block ' + block + ' %}' + content + '{% endblock %}';
      }

      if (layout) {
        content = '{% extends "layouts/' + layout + '.html" %}' + content;
      }

      f.data.main = f.id;

      return f;
    })
    .map(f => { 
      let wrapper;
      let content = '';

      try { wrapper = f.data.wrapper || env.getGlobal('wrapper') || 'base'; } catch (e) {}

      f.content = env.render('layouts/' + wrapper + '.html', f.data);
      return f;
    })
    .map(f => {
      if (f.data.draft) return f;
      mkdirp.sync(f.target_dir);
      fs.writeFileSync(f.target_path, f.content, { encoding: 'utf8' });
      console.log('Written', f.target_path);
      return f;
    });

  // console.dir(files);
});
