import time

from mango_service_v3_py.api import MangoServiceV3Client

if __name__ == "__main__":

    mango_service_v3_client = MangoServiceV3Client()
    sleep = 0.5
    while True:
        try:
            resp = mango_service_v3_client.get_balances()
            print(resp)
            sleep = sleep * 2
            time.sleep(sleep)
        except:
            pass
