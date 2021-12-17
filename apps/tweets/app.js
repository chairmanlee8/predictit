require('module-alias/register');

const ipc = require('electron').ipcRenderer;
const Table = require('@app/../pnl/components/table'); // CR: better link path

// CR: refactor with the version in pnl
function formatMoney(x) {
  let wholePart = Math.trunc(Math.abs(x)).toString();
  wholePart = x < 0 ? '-' + wholePart : wholePart;
  let fractionalPart2 = Math.trunc(Math.abs(x - wholePart) * 100).toString();
  return `${wholePart.padStart(1, ' ')}.${fractionalPart2.padStart(2, '0')}`;
}

class PredictionViewer {
  constructor(domElement, market, prediction) {
    this.market = market;
    this.prediction = prediction;
    this.table = new Table(
      domElement,
      [
        { label: '', class: 'bracket', getValue: (b) => b.name },
        {
          label: 'Bid',
          class: 'monospace money',
          getValue: (b) => formatMoney(b.bid),
        },
        {
          label: 'Ask',
          class: 'monospace money',
          getValue: (b) => formatMoney(b.ask),
        },
        {
          label: 'Last',
          class: 'monospace money',
          getValue: (b) => formatMoney(b.last),
        },
        {
          label: 'EOM',
          class: 'monospace money',
          getValue: (b) =>
            this.prediction
              ? formatMoney(this.prediction.eom.prediction[b.name].value)
              : '',
        },
        {
          label: 'EOD',
          class: 'monospace money',
          getValue: (b) =>
            this.prediction
              ? formatMoney(this.prediction.eod.prediction[b.name].value)
              : '',
        },
      ],
      market.brackets
    );
  }

  updateMarket(market) {
    this.market = market;
    this.table.update(this.market.brackets);
    this.table.render();
  }

  updatePrediction(prediction) {
    this.prediction = prediction;
    this.table.update(this.market.brackets);
    this.table.render();

    // CR: ugly place to put things
    if (this.prediction) {
      let debugInfo = '';
      debugInfo += `
        <div>
          Current count (adjusted):
          ${this.prediction.eom.debug_info.current_count}
        </div>`;
      debugInfo += `
        <div>
          Hours left:
          ${this.prediction.eom.debug_info.am_hours_left.toFixed(2)} (am),
          ${this.prediction.eom.debug_info.pm_hours_left.toFixed(2)} (pm)
        </div>`;
      debugInfo += `
        <div>
          Today:
          ${this.prediction.eom.debug_info.today_am.value.toFixed(2)} (am),
          ${this.prediction.eom.debug_info.today_pm.value.toFixed(2)} (pm),
          ${this.prediction.eom.debug_info.today_storm.value.toFixed(2)} (storm)
        </div>`;
      debugInfo += `
        <div>
          Day rate:
          ${this.prediction.eom.debug_info.day_mean.value.toFixed(2)}
          s.d. ${this.prediction.eom.debug_info.day_std.toFixed(2)}
        </div>`;
      debugInfo += `
        <div>
          AM rate:
          ${this.prediction.eom.debug_info.am_mean.value.toFixed(2)}
          s.d. ${this.prediction.eom.debug_info.am_std.toFixed(2)}
        </div>`;
      debugInfo += `
        <div>
          PM rate:
          ${this.prediction.eom.debug_info.pm_mean.value.toFixed(2)}
          s.d. ${this.prediction.eom.debug_info.pm_std.toFixed(2)}
        </div>`;
      debugInfo += `
        <div>
          EOM prediction:
          ${this.prediction.eom.debug_info.prediction_mean.value.toFixed(2)}
          s.d. ${this.prediction.eom.debug_info.prediction_std.toFixed(2)}
        </div>`;
      debugInfo += `
        <div>
          EOD prediction:
          ${this.prediction.eod.debug_info.prediction_mean.value.toFixed(2)}
          s.d. ${this.prediction.eod.debug_info.prediction_std.toFixed(2)}
        </div>`;
      document.getElementById('debugInfo').innerHTML = debugInfo;
    } else {
      document.getElementById('debugInfo').innerHTML = '';
    }
  }
}

const predictionViewer = new PredictionViewer(
  document.getElementById('prediction'),
  { brackets: [] },
  null
);

var tweetsViewer = new Vue({
  el: '#tweets',
  data: {
    message: 'tweets me',
  },
});

//
// IPC apparatus
//

let currentRequestToken = null;
let currentRequestCallback = null;
let nextRequestToken = 1;

ipc.on('python', function (event, data) {
  console.log(data);

  let responseToken = data[0];
  let response = data[1];

  if (responseToken == currentRequestToken) {
    document.getElementById('loading').className = 'hidden';
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
  document.getElementById('loading').className = '';
  ipc.send('python', [currentRequestToken, command].concat(args));
}

function setMarket(marketId) {
  sendPythonRequest('set-market', [marketId], function (market) {
    predictionViewer.updateMarket(market);
  });
}

function refreshMarketdata() {
  sendPythonRequest('refresh-marketdata', [], function (market) {
    predictionViewer.updateMarket(market);
  });
}

function refreshTweets() {
  sendPythonRequest('refresh-tweets', [], function () {});
}

function predict(adjustCurrentCount) {
  sendPythonRequest('predict', [adjustCurrentCount], function (prediction) {
    predictionViewer.updatePrediction(prediction);
  });
}

document.getElementById('predict').addEventListener('click', (event) => {
  predictionViewer.updatePrediction(null);
  predict(document.getElementById('adjustCurrentCount').value);
});

document.getElementById('refresh').addEventListener('click', (event) => {
  refreshMarketdata();
});

document.getElementById('sync').addEventListener('click', (event) => {
  refreshTweets();
});

document.getElementById('RDT').addEventListener('click', (event) => {
  predictionViewer.updateMarket({ brackets: [] });
  setMarket(6704);
});

document.getElementById('WH').addEventListener('click', (event) => {
  predictionViewer.updateMarket({ brackets: [] });
  setMarket(6708);
});

document.getElementById('POTUS').addEventListener('click', (event) => {
  predictionViewer.updateMarket({ brackets: [] });
  setMarket(6712);
});
