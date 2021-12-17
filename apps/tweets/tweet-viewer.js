require('module-alias/register');

const addInterval = require('date-fns/add');
const formatDate = require('date-fns/format');

// CR: would be nice to do dead-digit styling, e.g. 0.02 should have the leading zeros grayed
function formatMoney(x) {
  let wholePart = Math.trunc(Math.abs(x)).toString();
  wholePart = x < 0 ? '-' + wholePart : wholePart;
  let fractionalPart2 = Math.trunc(Math.abs(x - wholePart) * 100).toString();
  return `${wholePart.padStart(1, ' ')}.${fractionalPart2.padStart(2, '0')}`;
}

var state = {
  filter: { tweet_type: 'all' },
  tweets: [],
  markets: {
    RDT: {
      id: 6733,
      handle: 'realDonaldTrump',
      adjustCurrentCount: 0,
      market: null,
      eod: null,
      eom: null,
    },
    WH: {
      id: 6738,
      handle: 'WhiteHouse',
      adjustCurrentCount: 0,
      market: null,
      eod: null,
      eom: null,
    },
    POTUS: {
      id: 6726,
      handle: 'POTUS',
      adjustCurrentCount: 0,
      market: null,
      eod: null,
      eom: null,
    },
  },
};

Vue.mixin({
  methods: { formatDate, formatMoney },
});

Vue.component('tweets-heatmap', {
  props: ['handle', 'daily', 'hourly'],
  data: function () {
    return { state: state };
  },
  template: `
    <table>
      <thead>
        <tr>
          <th colspan=4>
            <select v-model="state.filter" v-on:change="heatmap(handle)">
              <option v-bind:value="{ tweet_type: 'all' }">Originals & RTs</option>
              <option v-bind:value="{ tweet_type: 'original' }">Originals</option>
              <option v-bind:value="{ tweet_type: 'rt' }">RTs</option>
            </select>
          </th>
        </tr>
        <tr>
          <th>Date</th>
          <th></th>
          <th></th>
          <th v-for="hour in 24">{{ (hour - 1).toString().padStart(2, '0') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="[date, byHour] in Object.entries(hourly)">
          <td class="label">{{ date }}</td>
          <td v-bind:class="[ 'label', formatDate(new Date(date + 'T09:00:00-0400'), 'EEEEEE') ]">
            {{ formatDate(new Date(date + 'T09:00:00-0400'), 'EEEEEE') }}
          </td>
          <td v-bind:class="[ 'daily', 'rank-' + Math.floor(6 * (daily[date] && daily[date]['pct_rank']))]">
            {{ daily[date] && daily[date]["count"] }}
          </td>
          <td
            v-for="hour in 24" v-bind:class="['hourly', 'rank-' + Math.floor(6 * byHour['pct_rank'][hour - 1])]"
            v-on:click="showTweets(date, hour, hour)"
          >
            {{ byHour["count"][hour - 1] ? byHour["count"][hour - 1] : "" }}
          </td>
        </tr>
      </tbody>
    </table>
  `,
  methods: {
    showTweets: function (date, hourMin, hourMax) {
      showTweets(this.handle, date, hourMin - 1, hourMax - 1);
    },
    heatmap: function (handle) {
      getHeatmap(handle);
    },
  },
});

Vue.component('tweets-browser', {
  props: ['tweets'],
  template: `
    <ul>
      <li v-for="tweet of tweets">
        <div>{{ tweet.created_at }}</div>
        <div>{{ tweet.text }}</div>
      </li>
    </ul>
  `,
});

Vue.component('market', {
  props: ['market'],
  template: `
    <table>
      <thead>
        <tr>
          <th colspan=6>
            <button v-on:click="heatmap(market.handle)">Map</button>
            <span>
              <input type="number" v-model="market.adjustCurrentCount" />
            </span>
            <span>{{ market.handle }}</span>
          </th>
        </tr>
        <tr v-if="market.eom && market.eod">
          <td class="label scalar-info" colspan=6>
            <div>
              <span>
                <label>Now:</label>
                {{ market.eom.debug_info.current_count }}
              </span>
              <span>
                <label>Today:</label>
                {{ market.eom.debug_info.today_am.value.toFixed(0) }} /
                {{ market.eom.debug_info.today_pm.value.toFixed(0) }} /
                {{ market.eom.debug_info.today_storm.value.toFixed(0) }}
              </span>
              <span>
                <label>Avg:</label>
                {{ market.eom.debug_info.am_mean.value.toFixed(1) }} /
                {{ market.eom.debug_info.pm_mean.value.toFixed(1) }}
                ({{ market.eom.debug_info.day_mean.value.toFixed(1) }})
              </span>
            </div>
          </td>
        </tr>
        <tr v-if="market.eom && market.eod">
          <td class="label scalar-info" colspan=6>
            <div>
              <span>
                <label>EOM:</label>
                {{ market.eom.debug_info.prediction_mean.value.toFixed(1) }}
                &plusmn;
                {{ market.eom.debug_info.prediction_std.toFixed(1) }}
              </span>
              <span>
                <label>EOD:</label>
                {{ market.eod.debug_info.prediction_mean.value.toFixed(1) }}
                &plusmn;
                {{ market.eod.debug_info.prediction_std.toFixed(1) }}
              </span>
            </div>
          </td>
        </tr>
        <tr>
          <th></th>
          <th>Bid</th>
          <th>Ask</th>
          <th>Last</th>
          <th>EOM</th>
          <th>EOD</th>
        </tr>
      </thead>
      <tbody v-if="market.market">
        <tr v-for="bracket of market.market.brackets">
          <td class="label">{{ bracket.name }}</td>
          <td>{{ formatMoney(bracket.bid) }}</td>
          <td>{{ formatMoney(bracket.ask) }}</td>
          <td>{{ formatMoney(bracket.last) }}</td>
          <td>{{
            market.eom &&
            market.eom.prediction &&
            market.eom.prediction[bracket.name] &&
            formatMoney(market.eom.prediction[bracket.name].value)
          }}</td>
          <td>{{
            market.eod &&
            market.eod.prediction &&
            market.eod.prediction[bracket.name] &&
            formatMoney(market.eod.prediction[bracket.name].value)
          }}</td>
        </tr>
      </tbody>
    </table>
  `,
  methods: {
    heatmap: function (handle) {
      getHeatmap(handle);
    },
  },
});

var app = new Vue({
  el: '#app',
  data: { state: state, handle: '', daily: [], hourly: [] },
  methods: {
    refresh: function (event) {
      refresh();
    },
  },
});

//
// IPC
//

const ipc = require('electron').ipcRenderer;

let currentRequestToken = null;
let currentRequestCallback = null;
let nextRequestToken = 1;

ipc.on('python', function (event, data) {
  let responseToken = data[0];
  let response = data[1];

  if (responseToken == currentRequestToken) {
    if (currentRequestCallback) {
      currentRequestCallback(response);
    }
  } else {
    console.error(`response token ${responseToken} did not match`);
  }
});

function sendPythonRequest(command, args, callback) {
  currentRequestToken = nextRequestToken++;
  currentRequestCallback = callback;
  ipc.send('python', [currentRequestToken, command].concat(args));
}

function getHeatmap(handle) {
  sendPythonRequest('get-heatmap', [handle, state.filter.tweet_type], function (
    result
  ) {
    console.log(result);
    app.$data.handle = handle;
    app.$data.daily = result.daily;
    app.$data.hourly = result.hourly;
  });
}

function refresh() {
  sendPythonRequest(
    'get-markets-and-predictions',
    [
      [state.markets.RDT.id, state.markets.RDT.adjustCurrentCount],
      [state.markets.WH.id, state.markets.WH.adjustCurrentCount],
      [state.markets.POTUS.id, state.markets.POTUS.adjustCurrentCount],
    ],
    function (result) {
      console.log(result);
      state.markets.RDT.market = result[0].market;
      state.markets.RDT.eod = result[0].eod;
      state.markets.RDT.eom = result[0].eom;
      state.markets.WH.market = result[1].market;
      state.markets.WH.eod = result[1].eod;
      state.markets.WH.eom = result[1].eom;
      state.markets.POTUS.market = result[2].market;
      state.markets.POTUS.eod = result[2].eod;
      state.markets.POTUS.eom = result[2].eom;
    }
  );
}

function showTweets(handle, date, hourMin, hourMax) {
  sendPythonRequest('get-tweets', [handle, date, hourMin, hourMax], function (
    result
  ) {
    state.tweets = result;
  });
}

getHeatmap('Mike_Pence');
