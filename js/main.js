(function(global, undefined) {
  "use strict";

  var ANIMATION_TIME = 250;
  var BASE_URL;
  var REQUEST_URL;

  if (location.hostname === "localhost") {
    BASE_URL = "http://" + location.host + "/";
    REQUEST_URL = BASE_URL + "example.json?";
  } else if (location.hostname.indexOf("192.168") !== -1) {
    BASE_URL = "http://" + location.host + "/";
    REQUEST_URL = BASE_URL + "example.json?";
  } else {
    BASE_URL = "http://taisei.hekt.org/";
    REQUEST_URL = "http://taisei.hekt.org/api/json?";
  }

  var TYPES_DIC = {"normal":   "ノーマル", "fire":     "ほのお",
                   "water":    "みず",     "electric": "でんき",
                   "grass":    "くさ",     "psychic":  "エスパー",
                   "fighting": "かくとう", "poison":   "どく",
                   "ground":   "じめん",   "flying":   "ひこう",
                   "dragon":   "ドラゴン", "bug":      "むし",
                   "rock":     "いわ",     "ghost":    "ゴースト",
                   "ice":      "こおり",   "steel":    "はがね",
                   "dark":     "あく",     "fairy":    "フェアリー"};
  var THRESHOLDS_DIC = {"4": "4倍",  "2": "2倍",  "1": "等倍",
                        "0.5": "半減", "0.25": "1/4", "0": "無効"};
  var COMPARATORS_DIC = {"lte": "以下", "gte": "以上", "eq": "のみ",
                         "lt": "未満",  "gt": "超"};

  var popped = false;
  
  var isAndroidBrowser = (function(ua) {
    return ua.indexOf("Android") !== -1 &&
      ua.indexOf("Chrome") === -1 &&
      ua.indexOf("Firefox") === -1;
  })(navigator.userAgent);

  var touchEvent = (function() {
    var target;
    var callback = {};

    function initialize() {
      target = null;
      callback = {};
    }

    function start(e, func, thisObj) {
      if (isAndroidBrowser) return;

      target = e.target;
      callback = {
        func: func,
        this: thisObj,
        args: Array.prototype.slice.call(arguments, 3)
      };
    }

    function end(e) {
      if (e.target === target && callback.func) {
        e.preventDefault();
        e.stopPropagation();
        callback.func.apply(callback.this, callback.args);
      }
      initialize();
    }

    return {
      start: start,
      end: end,
      cancel: initialize,
      move: initialize
    };
  })();


  Vue.config.prefix = "data-v-";
  
  Vue.filter("toJaType", toJaType);
  Vue.filter("toJaThreshold", toJaThreshold);
  Vue.filter("toJaComparator", toJaComparator);

  
  var app = new Vue({
    data: {
      state: {
        mode: "search",
        queries: [],
        options: {finalForm: false}
      },
      storedOptions : {},
      unwatchState: undefined
    },
    methods: {
      stateWatchCallback: function() {
        this.updateTitle();
        this.pushState();
        this.request();
      },
      storedOptionsWatchCallback: function() {
        var json = JSON.stringify(this.storedOptions);
        localStorage.setItem("options", json);
      },
      onPopState: function(e) {
        popped = true;
        
        var state = e.state || parsePath(location.pathname);
        this.$emit("unwatchState");
        this.state = state;
        this.$emit("watchState");
        
        this.updateTitle();
        if (state.mode === "search") {
          this.$broadcast("queryListUpdated", this.state.queries);
          this.request();
        }
      },
      pushState: function() {
        var url = buildStateUrl(this.state);
        var title = buildStateTitle(this.state);
        history.pushState(this.state, title, url);
      },
      request: function() {
        if (this.state.mode !== "search") return;

        if (this.state.queries.length === 0) {
          this.$broadcast("requestCanceled");
        }
        else {
          this.$broadcast("requestStarted");
          
          var qs = buildQueryString(this.state.queries, this.state.options);
          var xhr = new XMLHttpRequest();
          xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) return;
            if (xhr.status === 200) {
              try {
                var json = JSON.parse(xhr.responseText);
                this.$broadcast("requestCompleted",
                                json, this.storedOptions.referenceUrlFormat);
              } catch (e) {
                this.$broadcast("requestFailed", "JSON Parse Error", qs);
              }
            } else {
              this.$broadcast("requestFailed",
                              "Request Failed (" + xhr.status + ")", qs);
            }
          }.bind(this);
          xhr.open("GET", REQUEST_URL + qs, true);
          xhr.send(null);
        }
      },
      updateTitle: function() {
        document.title = buildStateTitle(this.state);
      }
    },
    created: function() {
      // initialize before watching
      var storedOpts = localStorage.getItem("options");
      if (!storedOpts) {
        var oldOpt = localStorage.getItem("taisei.guideUrl");
        if (oldOpt)
          storedOpts = JSON.stringify({referenceUrlFormat: oldOpt});
      }
      this.storedOptions = storedOpts ? JSON.parse(storedOpts) : {
        referenceUrlFormat: "http://yakkun.com/xy/zukan/n{number}"
      };
      
      // watch
      var unwatchState = this.$watch("state", this.stateWatchCallback, true);
      var unwatchStoredOptions =
            this.$watch("storedOptions",
                        this.storedOptionsWatchCallback, true);

      // event listening
      this.$on("unwatchState", function() {
        unwatchState();
      });
      this.$on("watchState", function() {
        unwatchState = this.$watch("state", this.stateWatchCallback, true);
      });
      this.$on("removeQuery", function(index) {
        this.state.queries.$remove(index);
      });
      this.$on("addQuery", function(query) {
        this.$emit("unwatchState");
        this.state.queries.push(query);
        setTimeout(function() {
          this.stateWatchCallback();
          this.$emit("watchState");
        }.bind(this), ANIMATION_TIME);
      });
      this.$on("updateQuery", function(query) {
        var index = this.state.queries.map(function(q) {
          return q.type;
        }).indexOf(query.type);
        if (index !== -1) {
          this.$emit("unwatchState");
          this.state.queries[index].threshold = query.threshold;
          this.state.queries[index].comparator = query.comparator;
          this.stateWatchCallback();
          this.$emit("watchState");
        } else {
          console.warn("app: received 'updateQuery' but query's type " +
                       "does not exist in 'state.queries'.");
          this.$emit("addQuery", query);
        }
      });
      this.$on("toggleFinalFormCheckbox", function() {
        this.state.options.finalForm = !this.state.options.finalForm;
      });
      this.$on("changeMode", function(mode) {
        window.scrollTo(0, 0);
        this.state.mode = mode;
      });
      this.$on("changeStoredOptions", function(opts) {
        this.storedOptions = opts;
        this.$broadcast("storedOptionsChanged", opts);
      });
      this.$on("typeChanged", function(type) {
        this.$broadcast("typeChanged", type);
      });
    }
  }); // app

  
  //
  // EventListeners
  //

  window.addEventListener("popstate", function(e) {
    Vue.nextTick(app.onPopState.bind(app, e));
  });

  document.addEventListener("DOMContentLoaded", function() {
    if (isAndroidBrowser) {
      document.body.classList.add("android-browser");
    }
    
    var headerModel = app.$addChild({
      el: "#main-header",
      data: {
        selectedType: "normal"
      },
      created: function() {
        this.$on("typeChanged", function(type) {
          this.selectedType = type;
        });
      }
    }); // headerModel

    var queriesModel = app.$addChild({
      el: "#queries",
      template: "#queries-template",
      data: {
        selected: {type: "normal", threshold: "1", comparator: "lte"},
        typeOptions: Object.keys(TYPES_DIC),
        usedTypes: [],
        shows: {
          typeList: false,
          thresholdList: false,
          comparatorList: false
        },
        formButtonText: "追加",
        disabled: false
      },
      created: function() {
        function updateTypeOptions() {
          var f = function f(x) {
            return this.usedTypes.indexOf(x) === -1;
          }.bind(this);
          var m = function m(x) {
            return {value: x, text: TYPES_DIC[x]};
          };
          this.typeOptions = Object.keys(TYPES_DIC).filter(f).map(m);
        }
        var updateButtonText = function() {
          this.formButtonText =
            this.usedTypes.indexOf(this.selected.type) === -1 ?
            "追加" : "変更";
        }.bind(this);

        updateTypeOptions.call(this);
        
        this.$watch("usedTypes", updateButtonText);
        this.$watch("selected.type", function() {
          this.$dispatch("typeChanged", this.selected.type);
          updateButtonText();
        });
        
        this.$on("queryListUpdated", function(queries) {
          this.usedTypes = queries.map(function(x) {
            return x.type;
          });
        });
      },
      methods: {
        foldAll: function() {
          for (var k in this.shows) {
            this.shows[k] = false;
          }
        },
        onQueryCallback: function(e) {
          var type = e.target.dataset.typeValue ||
                e.target.parentNode.dataset.typeValue;
          var threshold = e.target.dataset.thresholdValue ||
                e.target.parentNode.dataset.thresholdValue;
          var comparator = e.target.dataset.comparatorValue ||
                e.target.parentNode.dataset.comparatorValue;
          this.selected = {
            type: type,
            threshold: threshold,
            comparator: comparator
          };
        },
        onLabelCallback: function(e) {
          var kind = e.target.dataset.kind;
          if (this.shows[kind + "List"]) {
            this.foldAll();
          } else {
            this.foldAll();
            this.shows[kind + "List"] = true;
          }
        },
        onListItemCallback: function(e) {
          var kind = e.target.dataset.kind;
          this.shows[kind + "List"] = false;
          this.selected[kind] = e.target.dataset.value;
        },
        onRemoveCallback: function(query, e) {
          var elem = e.target.parentNode;
          elem.classList.add("removed");
          setTimeout(function() {
            this.usedTypes = this.usedTypes.filter(function(t) {
              return t !== query.type;
            });
            this.$dispatch("removeQuery", query.$index);
          }.bind(this), ANIMATION_TIME);
        },
        onAddCallback: function(e) {
          if (this.disabled) return;

          window.scrollTo(0,0);
          
          // コピーしておかないと DOM 参照が残っちゃう
          var query = {
            type: this.selected.type,
            threshold: this.selected.threshold,
            comparator: this.selected.comparator
          };

          if (this.formButtonText === "追加") {
            this.$dispatch("addQuery", query);
            this.usedTypes.push(this.selected.type);
          } else {
            this.$dispatch("updateQuery", query);
          }
        },
        onCheckboxCallback: function(e) {
          this.$dispatch("toggleFinalFormCheckbox");
        },
        onClickQuery: function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.onQueryCallback(e);
        },
        onClickCheckbox: function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.onCheckboxCallback();
        },
        onClickLabel: function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.onLabelCallback(e);
        },
        onClickListItem: function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.onListItemCallback(e);
        },
        onClickRemove: function(query, e) {
          e.preventDefault();
          e.stopPropagation();
          this.onRemoveCallback(query, e);
        },
        onClickAdd: function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.onAddCallback(e);
        },
        onTouchQuery: function(e) {
          touchEvent.start(e, this.onQueryCallback, this, e);
        },
        onTouchCheckbox: function(e) {
          touchEvent.start(e, this.onCheckboxCallback, this, e);
        },
        onTouchLabel: function(e) {
          if (isAndroidBrowser) return;
          touchEvent.start(e, this.onLabelCallback, this, e);
        },
        onTouchListItem: function(e) {
          touchEvent.start(e, this.onListItemCallback, this, e);
        },
        onTouchRemove: function(query, e) {
          e.stopPropagation();
          touchEvent.start(e, this.onRemoveCallback, this, query, e);
        },
        onTouchAdd: function(e) {
          touchEvent.start(e, this.onAddCallback);
        },
        onTouchMove: function(e) {
          touchEvent.move(e);
        },
        onTouchCancel: function(e) {
          touchEvent.cancel(e);
        },
        onTouchEnd: function(e) {
          touchEvent.end(e);
        }
      }
    }); // queriesModel

    var resultsModel = app.$addChild({
      el: "#results",
      template: "#results-template",
      data: {
        list: [],
        loading: false,
        errorMessage: "",
        errorLog: "hoge",
        shows: {
          emptyResult: false,
          error: false,
          information: true
        }
      },
      created: function() {
        var displayResults = function (json, format) {
          if (json.length === 0) {
            this.list = [];
            this.shows.emptyResult = true;
            return;
          }
          this.shows.emptyResult = false;
          this.list = json.map(function(x) {
            x.referenceUrl = buildReferenceUrl(x, format);
            return x;
          });
        }.bind(this);
        
        var updateReferenceUrl = function(format) {
          this.list.forEach(function(x) {
            x.referenceUrl = buildReferenceUrl(x, format);
          });
        }.bind(this);

        // event listeners
        this.$on("requestStarted", function() {
          this.loading = true;
          this.shows.information = false;
        });
        this.$on("requestCanceled", function() {
          this.list = [];
          this.loading = false;
          this.shows.information = true;
        }),
        this.$on("requestCompleted", function(json, format) {
          this.shows.information = false;
          displayResults(json, format);
          this.loading = false;
        });
        this.$on("requestFailed", function(msg, queryString) {
          this.shows.information = false;
          this.shows.error = true;
          this.loading = false;
          this.errorMessage = msg;
          this.errorLog = msg + "\n" + location.pathname + "\n" + queryString;
        });
        this.$on("storedOptionsChanged", function(options) {
          updateReferenceUrl(options.referenceUrlFormat);
        });
      }
    }); // resultsModel

    var fotterNaviModel = app.$addChild({
      el: "#foot-navi",
      data: {},
      created: function() {},
      methods: {
        scrollToTop: function(e) {
          window.scrollTo(0, 0);
          e.preventDefault();
        },
        showSettingView: function(e) {
          this.$dispatch("changeMode", "setting");
          e.preventDefault();
        }
      }
    }); // footerNaviModel

    var settingViewModel = app.$addChild({
      el: "#setting",
      template: "#setting-template",
      data: {
        referenceExample: "",
        fields: {
          referenceUrl: ""
        }
      },
      created: function() {
        var updateReferenceExample = function(format) {
          var data = {number: 6, name: "メガリザードンX"};
          this.referenceExample = buildReferenceUrl(data, format);
        }.bind(this);

        // initialize
        this.fields.referenceUrl = app.storedOptions.referenceUrlFormat;
        updateReferenceExample(this.fields.referenceUrl);

        // watch
        this.$watch("fields.referenceUrl", updateReferenceExample);
      },
      methods: {
        saveAndCloseSettingView: function(e) {
          this.$dispatch("changeStoredOptions", {
            referenceUrlFormat: this.fields.referenceUrl
          });
          this.$dispatch("changeMode", "search");
          e.preventDefault();
        },
        closeSettingView: function(e) {
          this.$dispatch("changeMode", "search");
          e.preventDefault();
        },
        onPresetCallback: function(e) {
          var val = e.target.dataset.presetValue;
          this.fields.referenceUrl = val;
        },
        onClickPreset: function(e) {
          e.preventDefault();
          e.stopPropagation();
          this.onPresetCallback(e);
        },
        onTouchPreset: function(e) {
          touchEvent.start(e, this.onPresetCallback, this, e);
        },
        onTouchMove: function(e) {
          touchEvent.move(e);
        },
        onTouchCancel: function(e) {
          touchEvent.cancel(e);
        },
        onTouchEnd: function(e) {
          touchEvent.end(e);
        }
      }
    }); // settingViewModel

    // some browser doesn't fire 'popState' on page's load
    if (!popped) app.onPopState({});
  }); // DOMContentLoaded

  
  //
  // Helpers
  //
  
  function buildQueryString(queries, options) {
    var strList = [];
    queries.forEach(function(q) {
      var s = q.type + "=" +
            encodeURIComponent(q.comparator + "," + q.threshold);
      strList.push(s);
    });
    for (var k in options) {
      strList.push(k + "=" + options[k]);
    }
    strList.sort();
    return strList.join("&");
  }

  function buildStateTitle(state) {
    var BASE_TITLE = "ポケモン耐性検索";
    if (state.mode == "setting") {
      return "設定 | " + BASE_TITLE;
    } else if (state.queries.length === 0) {
      return BASE_TITLE;
    } else {
      var strList = state.queries.map(function(q) {
        return toJaType(q.type) +
          toJaThreshold(q.threshold) +
          toJaComparator(q.comparator);
      });
      if (state.options.finalForm) strList.push("最終進化形");
      return strList.join(" ") + " のポケモン | " + BASE_TITLE;
    }
  }

  function buildStateUrl(state) {
    if (state.mode === "setting") {
      return BASE_URL + "setting/";
    } else if (!state.queries || state.queries.length === 0) {
      return BASE_URL;
    } else {
      var strList = state.queries.map(function(q) {
        return [q.type, q.comparator, q.threshold + "x"].join("-");
      });
      if (state.options.finalForm) {
        strList.push("final-form");
      }
      return BASE_URL + strList.join("/") + "/";
    }
  }

  function buildReferenceUrl(data, format) {
    function original(name) {
      return name.replace(/^メガ/, "").replace(/[^0-9ァ-ンー♂♀]/g, "");
    }
    
    if (!data) return format;
    return format
      .replace("{name}", data.name)
      .replace("{oname}", original(data.name))
      .replace("{number}", data.number)
      .replace("{number3}", zeroPadding(data.number, 3));
  }

  function parsePath(path) {
    function parseQueryString(queryString) {
      try {
        var ls = queryString.split("-");
        
        return {
          type: ls[0],
          comparator: ls[1],
          threshold: ls[2].replace("x", "")
        };
      } catch (e) {
        return null;
      }
    }
    
    var ts = Object.keys(TYPES_DIC);
    var state;
    var qsList = path.split("/");

    if (qsList.indexOf("setting") !== -1) {
      state = createState("setting");
    } else {
      state = createState("search");
      state.queries = qsList.map(parseQueryString).filter(function(x) {
        return x !== null && ts.indexOf(x.type) !== -1;
      });
      state.options = {
        finalForm: qsList.indexOf("final-form") !== -1
      };
    }

    return state;
  }

  function createState(mode) {
    return {
      mode: mode,
      queries: [],
      options: {}
    };
  }

  function zeroPadding(number, length) {
    return (Array(length).join("0") + number).slice(-length);
  }

  // translations
  function toJaType(type) {
    return (type && type.toLowerCase() in TYPES_DIC) ?
      TYPES_DIC[type.toLowerCase()] : type;
  }
  function toJaThreshold(threshold) {
    return threshold ? THRESHOLDS_DIC[threshold] : threshold;
  }
  function toJaComparator(comparator) {
    return comparator ? COMPARATORS_DIC[comparator] : comparator;
  }
  
})(window);
