const Transaction = require('@app/types/transaction');

function format(transactions, filteredTransactions) {
  const data = [];
  let cumProfitLoss = 0;
  let cumFees = 0;

  transactions.sort(Transaction.ascending);
  filteredTransactions.sort(Transaction.ascending);

  for (const t of transactions) {
    cumProfitLoss += t.profitLoss;
    cumFees += t.fees;
    data.push([t.dateExecuted, cumProfitLoss + cumFees, null]);
  }

  cumProfitLoss = 0;
  cumFees = 0;

  for (const t of filteredTransactions) {
    cumProfitLoss += t.profitLoss;
    cumFees += t.fees;
    data.push([t.dateExecuted, null, cumProfitLoss + cumFees]);
  }

  data.sort((a, b) => a[0] - b[0]);

  return data;
}

class PnlGraph {
  constructor(domElement, transactions, filteredTransactions = []) {
    this.onZoomCallback = null;
    this.uiComponent = new Dygraph(
      domElement,
      format(transactions, filteredTransactions),
      {
        strokeWidth: 1.5,
        showRangeSelector: true,
        zoomCallback: _.debounce((minTime, maxTime) => {
          if (this.onZoomCallback) {
            this.onZoomCallback(new Date(minTime), new Date(maxTime));
          }
        }, 500)
      }
    );
  }

  onZoom(f) {
    this.onZoomCallback = f;
  }

  update(transactions, filteredTransactions = []) {
    this.uiComponent.updateOptions({
      file: format(transactions, filteredTransactions)
    });
  }
}

module.exports = PnlGraph;
