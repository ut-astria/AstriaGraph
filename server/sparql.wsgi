from os import path
import json
import requests

ScriptPath = path.dirname(path.abspath(__file__))
ServConf = json.load(open(path.join(ScriptPath, "servconf.json")))

def select(filter):

    qry = ("SELECT ?s ?p ?o "
           "WHERE { "
           "?sub ?pre ?o "
           "BIND(STRAFTER(STR(?sub), \"#track\") as ?s) "
           "BIND(STRAFTER(STR(?pre), \"_\") as ?p) "
           "FILTER(REGEX(STR(?sub), \"%s\"))}" % filter)

    req = requests.get(ServConf["SPARQL"]["ReadEndPoint"],
                       params = {"query" : qry, "output" : "csv"})
    return(req)

def application(env, respond):

    filter = env["QUERY_STRING"].split("=")[-1]
    resp = select(filter)

    status = "%3d %s" % (resp.status_code,
                         requests.status_codes._codes[resp.status_code][0])
    respond(status, [("Content-Type", "text/csv"),
                     ("Content-Length", str(len(resp.text)))])

    return([resp.text.encode('UTF-8')])
