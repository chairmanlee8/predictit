from datetime import datetime, timedelta
import json
import logging
import requests
import sys
import time
from google.cloud import bigquery
from google.oauth2 import service_account

# CR alee: capture "status" changes in contracts


def poll_marketdata():
    r = requests.get("https://www.predictit.org/api/marketdata/all/", timeout=15)
    j = r.json()
    now = datetime.now().isoformat()

    markets = []
    market_cols = ("id", "name", "shortName", "url")

    contracts = []
    contract_cols = ("id", "name", "shortName")

    ticks = []
    tick_cols = (
        "lastTradePrice",
        "bestBuyYesCost",
        "bestBuyNoCost",
        "bestSellYesCost",
        "bestSellNoCost",
        "lastClosePrice",
    )

    for m in j["markets"]:
        d = {}
        for col in market_cols:
            d[col] = m[col]
        markets.append(d)

        for c in m["contracts"]:
            d = {}
            d["marketId"] = m["id"]
            d["dateEnd"] = c["dateEnd"] if c["dateEnd"] != "N/A" else None
            for col in contract_cols:
                d[col] = c[col]
            contracts.append(d)

            t = {}
            t["contractId"] = c["id"]
            t["sampleTime"] = now
            for col in tick_cols:
                t[col] = c[col]
            ticks.append(t)

    return markets, contracts, ticks


def write_data_to_file(filename, data):
    with open(filename, "w") as outfile:
        for d in data:
            print(json.dumps(d), file=outfile)


def upload_to_bigquery(
    client, table_id, data, write_disposition, schema=None, time_partitioning=None
):
    file = "{}.json".format(table_id)
    dataset_id = "predictit"
    dataset_ref = client.dataset(dataset_id)
    table_ref = dataset_ref.table(table_id)
    job_config = bigquery.LoadJobConfig()
    job_config.source_format = bigquery.SourceFormat.NEWLINE_DELIMITED_JSON
    job_config.autodetect = True
    job_config.write_disposition = write_disposition
    if schema:
        job_config.schema = schema
    if time_partitioning:
        job_config.time_partitioning = time_partitioning

    write_data_to_file(file, data)

    with open(file, "rb") as infile:
        job = client.load_table_from_file(infile, table_ref, job_config=job_config)

    # CR alee: this sometimes throws with 500
    try:
        job.result()
        logging.info("Loaded %d rows into %s:%s", job.output_rows, dataset_id, table_id)
    except:
        logging.error(
            "Failed to load rows into %s:%s with exception %s",
            dataset_id,
            table_id,
            sys.exc_info()[0],
        )


if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s %(levelname)s: %(message)s", level=logging.INFO
    )

    credentials = service_account.Credentials.from_service_account_file(
        "google-cloud-service-account.json",
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    client = bigquery.Client(credentials=credentials, project=credentials.project_id)

    next_poll = None

    while True:
        if next_poll:
            wait_for = (next_poll - datetime.now()).total_seconds()
            if wait_for > 0.0:
                logging.info("Sleeping for %.2f seconds...", wait_for)
                time.sleep(wait_for)
            else:
                logging.error("Behind! skew=%.2fs", wait_for)

        next_poll = datetime.now()
        next_poll += timedelta(minutes=1)

        logging.info("Querying PI...")
        try:
            markets, contracts, ticks = poll_marketdata()
        except:
            logging.error("Failed to query PI with exception %s", sys.exc_info()[0])
            continue

        logging.info("Loading to BQ...")
        upload_to_bigquery(
            client, "markets", markets, bigquery.WriteDisposition.WRITE_TRUNCATE
        )
        upload_to_bigquery(
            client, "contracts", contracts, bigquery.WriteDisposition.WRITE_TRUNCATE
        )
        upload_to_bigquery(
            client,
            "ticks",
            ticks,
            bigquery.WriteDisposition.WRITE_APPEND,
            schema=[
                bigquery.SchemaField("contractId", "INTEGER", "REQUIRED"),
                bigquery.SchemaField("sampleTime", "TIMESTAMP", "REQUIRED"),
                bigquery.SchemaField("lastTradePrice", "FLOAT"),
                bigquery.SchemaField("bestBuyYesCost", "FLOAT"),
                bigquery.SchemaField("bestBuyNoCost", "FLOAT"),
                bigquery.SchemaField("bestSellYesCost", "FLOAT"),
                bigquery.SchemaField("bestSellNoCost", "FLOAT"),
                bigquery.SchemaField("lastClosePrice", "FLOAT"),
            ],
            time_partitioning=bigquery.TimePartitioning(
                type_=bigquery.TimePartitioningType.DAY, field="sampleTime"
            ),
        )
