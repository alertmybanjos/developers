var gulp = require('gulp'),
    gutil = require('gulp-util'),
    merge = require('merge-stream'),
    clean = require('gulp-clean'),
    rename = require('gulp-rename'),
    order = require("gulp-order"),
    argv = require('minimist')(process.argv),
    rev = require('gulp-rev'),
    fs = require('fs'),
    revReplace = require('gulp-rev-replace'),
    path = require('path'),
    runSequence = require('run-sequence'),
    cp = require('child_process'),
    lunr = require('lunr'),
    plugins = require('gulp-load-plugins')();

var opt = {
    distFolder: 'static/build',
    themesFolder: '../docs/themes/docsmith',
    targetHugoConfig: '../docs'

}

var cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tasks", "config.json")));
var server = cfg.servers[argv.target]

gulp.task('build', function(cb) {
    runSequence('build:clean', 'fonts', 'build:index', ['js-libs', 'js', 'css'], 'revreplace-templates',
        cb);
});


// build:theme does a full rebuild of the docsmith theme. 
// The result replaces the theme in <doc-repo>/themes/docsmith.
// That theme will then be used for any publishing to a live server.
gulp.task('build:theme', ['build:clean-theme'], function(cb) {
    runSequence('build:copy-theme',
        cb);
});


// TODO(bep) the PROD vs DEV partials
gulp.task('build:copy-theme', function() {
    gulp.src(['layouts/**/*'])
        .pipe(gulp.dest(opt.themesFolder + "/layouts"))
        .on('error', gutil.log);

    gulp.src(['static/**/*'])
        .pipe(gulp.dest(opt.themesFolder + "/static"))
        .on('error', gutil.log);

    return gulp.src(['config.toml'])
        .pipe(gulp.dest(opt.targetHugoConfig))
        .on('error', gutil.log);
});

gulp.task('build:clean-theme', function() {
    return gulp.src(opt.themesFolder, {
            read: false
        })
        .pipe(clean({
            force: true
        }));
});

gulp.task('build:all', function(cb) {
    runSequence('vendors', 'build',
        cb);
});


var vendors = ['bootstrap', 'font-awesome/less', 'font-awesome/fonts', 'lunr'];

gulp.task('build:clean-vendors', function() {
    return gulp.src('assets/vendors/', {
            read: false
        })
        .pipe(clean());
});

gulp.task('build:clean', function() {
    return gulp.src(opt.distFolder, {
            read: false
        })
        .pipe(clean());
});

gulp.task('vendors', ['build:clean-vendors'], function() {
    return merge(vendors.map(function(vendor) {
        return gulp.src('node_modules/' + vendor + '/**/*')
            .pipe(gulp.dest('assets/vendors/' + vendor));
    }));
});

gulp.task('fonts', function() {
    return gulp.src(['assets/vendors/bootstrap/dist/fonts/*', 'assets/vendors/font-awesome/fonts/*'])
        .pipe(gulp.dest(opt.distFolder + '/fonts'))
        .on('error', gutil.log);
});


gulp.task('revision', [], function() {
    return gulp.src([opt.distFolder + '/**/home.min.css', opt.distFolder + '/**/main.min.js', opt.distFolder + '/**/libs.min.js'], {
            base: path.join(process.cwd(), opt.distFolder)
        })
        .pipe(rev())
        .pipe(gulp.dest(opt.distFolder))
        .pipe(rev.manifest("rev-manifest1.json"))
        .pipe(gulp.dest("assets")).on('error', gutil.log)
});

gulp.task('revision-lunr', [], function() {
    return gulp.src([opt.distFolder + '/lunr.json'], {
            base: path.join(process.cwd(), opt.distFolder)
        })
        .pipe(rev())
        .pipe(gulp.dest(opt.distFolder))
        .pipe(rev.manifest("rev-manifest2.json"))
        .pipe(gulp.dest("assets")).on('error', gutil.log)
});

gulp.task("revreplace-templates", ["revision"], function() {
    var manifest = gulp.src("./assets/rev-manifest1.json");

    return gulp.src(["layouts/partials/includes_body_end.html", "layouts/partials/includes_head.html"])
        .pipe(rename(function(path) {
            path.extname = "_prod.html";
        }))
        .pipe(revReplace({
            manifest: manifest
        }))
        .pipe(gulp.dest("layouts/partials")).on('error', gutil.log);
});

gulp.task("revreplace-js", ["revision-lunr"], function() {
    var manifest = gulp.src("./assets/rev-manifest2.json");

    return gulp.src([opt.distFolder + "/js/main.min.js"])
        .pipe(revReplace({
            manifest: manifest
        }))
        .pipe(gulp.dest(opt.distFolder + "/js")).on('error', gutil.log);
});


gulp.task('js-libs', function() {
    return gulp.src(['assets/js/libs/**/*.js', 'assets/vendors/bootstrap/dist/js/bootstrap.js', 'assets/vendors/lunr/lunr.js'])
        .pipe(order([
            "handlebars*.js",
            "underscore*.js",
            "lunr.js",
            "**/*.js"
        ]))
        .pipe(plugins.concat('libs.js'))
        .pipe(gulp.dest(opt.distFolder + '/js'))
        .pipe(plugins.uglify())
        .pipe(rename('libs.min.js'))
        .pipe(gulp.dest(opt.distFolder + '/js')
            .on('error', gutil.log))
});

gulp.task('js', function(cb) {
    runSequence('js-main', 'js-min', 'revreplace-js', cb)

});


gulp.task('js-min', function(cb) {
    return gulp.src(opt.distFolder + '/js/main.js')
        .pipe(plugins.uglify())
        .on('error', function(err) {
            gutil.log(gutil.colors.red('[Error]'), err.toString());
        })
        .pipe(rename('main.min.js'))
        .pipe(gulp.dest(opt.distFolder + '/js')
            .on('error', gutil.log))

});

gulp.task('js-main', function(cb) {
    return js()
});

function js() {
    return gulp.src('assets/js/*.js')
        .pipe(plugins.concat('main.js'))
        .pipe(gulp.dest(opt.distFolder + '/js'))
}

gulp.task('css', function() {
    return less()
        .pipe(rename('home.min.css'))
        .pipe(gulp.dest(opt.distFolder + '/stylesheets')).on('error', gutil.log);
});

gulp.task('css-dev', function() {
    return less();
});

function less() {
    return gulp.src('assets/stylesheets/home.less')
        .pipe(plugins.plumber())
        .pipe(plugins.less())
        .on('error', function(err) {
            gutil.log(err);
            this.emit('end');
        })
        .pipe(plugins.autoprefixer({
            browsers: ["last 2 versions"]
        }))
        .pipe(gulp.dest(opt.distFolder + '/stylesheets'))
        .pipe(plugins.cssmin())
}

gulp.task('hugo:server', function(cb) {
    return hugo(cb, "server")

});

gulp.task('hugo', ["hugo:clean"], function(cb) {
    return hugo(cb, "--destination=dist/docs")

});

gulp.task('hugo:dev', ["hugo:clean"], function(cb) {
    return hugo(cb, "--destination=dist/docs", "--baseURL=http://localhost:1313/docs")

});

gulp.task('hugo:search-index', ["hugo:clean"], function(cb) {
    return hugo(cb, "--destination=dist/docs", "--config=config.toml,config-search.toml")
});

gulp.task('hugo:clean', function() {
    return gulp.src('dist/docs', {
            read: false
        })
        .pipe(clean());
});


function hugo(cb, ...args) {
    setHugoEnv()

    const hugoArgs = args ? args : [];

    const hugo = cp.spawn("hugo", hugoArgs, {
        stdio: "pipe"
    });

    hugo.on("close", function(code) {
        if (code === 0) {
            cb();
        } else {
            cb("hugo failed");
        }
    });

    hugo.stdout.on('data', function(data) {
        console.log(data.toString());
    });

    hugo.stderr.on('data', function(data) {
        console.log("error:" + data.toString());
    });
}

gulp.task('build:index', ["hugo:search-index"], function(cb) {
    var data = {
        store: {}
    };

    var idx = lunr(function() {
        this.field('title', {
            boost: 30
        });
        this.field('keywords', {
            boost: 10
        });
        this.field('toc', {
            boost: 5
        });
        this.ref('href');

        var source = JSON.parse(fs.readFileSync("dist/docs/index.json"));

        var that = this;

        source.forEach(function(item) {
            var doc = {
                'title': item.title,
                'keywords': item.keywords,
                'toc': item.toc,
                'href': item.ref
            };

            data.store[doc.href] = item.title

            that.add(doc);
        });

    });

    data.index = idx

    var serializedIdx = JSON.stringify(data)

    fs.writeFile(opt.distFolder + '/lunr.json', serializedIdx, cb);

});




function setHugoEnv() {
    if (argv.target === "production") {
        process.env.HUGO_ENV = "prod"
    } else if (argv.target) {
        process.env.HUGO_ENV = argv.target
    } else {
        // Development
        process.env.HUGO_ENV = ""
    }

    if (server && server.baseURL) {
        process.env.HUGO_BASEURL = server.baseURL
    }

}