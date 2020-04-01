import importlib
import json
import logging
import codecs
import textwrap
import pprint
from datetime import datetime

from flask import Flask
from flask import request
import natcap.invest.cli
import natcap.invest.datastack

logging.basicConfig(level=logging.DEBUG)
LOGGER = logging.getLogger(__name__)

app = Flask(__name__)

# Maps the names returned by invest list to the module with ARGS_SPEC
MODEL_MODULE_MAP = {
    "carbon": "carbon",
    "coastal_blue_carbon": "coastal_blue_carbon.coastal_blue_carbon",
    "coastal_blue_carbon_preprocessor": "coastal_blue_carbon.preprocessor",
    "coastal_vulnerability": "coastal_vulnerability",
    "crop_production_percentile": "crop_production_percentile",
    "crop_production_regression": "crop_production_regression",
    "delineateit": "delineateit",
    "finfish_aquaculture": "finfish_aquaculture.finfish_aquaculture",
    "fisheries": "fisheries.fisheries",
    "fisheries_hst": "fisheries.fisheries_hst",
    "forest_carbon_edge_effect": "forest_carbon_edge_effect",
    "globio": "globio",
    "habitat_quality": "habitat_quality",
    "habitat_risk_assessment": "hra",
    "hydropower_water_yield": "hydropower.hydropower_water_yield",
    "ndr": "ndr.ndr",
    "pollination": "pollination",
    "recreation": "recreation.recmodel_client",
    "routedem": "routedem",
    "scenario_generator_proximity": "scenario_gen_proximity",
    "scenic_quality": "scenic_quality.scenic_quality",
    "sdr": "sdr.sdr",
    "seasonal_water_yield": "seasonal_water_yield.seasonal_water_yield",
    "urban_flood_risk_mitigation": "urban_flood_risk_mitigation",
    "urban_cooling_model": "urban_cooling_model",
    "wave_energy": "wave_energy",
    "wind_energy": "wind_energy"
}


def shutdown_server():
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        raise RuntimeError('Not running with the Werkzeug Server')
    func()

@app.route('/ready', methods=['GET'])
def get_is_ready():
    return 'Flask ready'


@app.route('/shutdown', methods=['GET'])
def shutdown():
    shutdown_server()
    return 'Flask server shutting down...'


@app.route('/models', methods=['GET'])
def get_invest_models():
    return natcap.invest.cli.build_model_list_json()


@app.route('/getspec', methods=['POST'])
def get_invest_getspec():
    target_model = request.get_json()['model']
    target_module = 'natcap.invest.' + MODEL_MODULE_MAP[target_model]
    model_module = importlib.import_module(name=target_module)
    spec = model_module.ARGS_SPEC
    return json.dumps(spec)


@app.route('/validate', methods=['POST'])
def get_invest_validate():
    payload = request.get_json()
    LOGGER.debug(payload)
    target_module = payload['model_module']
    args_dict = json.loads(payload['args'])
    LOGGER.debug(args_dict)
    try:
        limit_to = payload['limit_to']
    except KeyError:
        limit_to = None
    model_module = importlib.import_module(name=target_module)
    results = model_module.validate(args_dict, limit_to=limit_to)
    LOGGER.debug(results)
    return json.dumps(results)


@app.route('/post_datastack_file', methods=['POST'])
def post_datastack_file():
    filepath = request.get_json()['datastack_path']
    stack_type, stack_info = natcap.invest.datastack.get_datastack_info(
        filepath)
    result_dict = {
        'type': stack_type,
        'args': stack_info.args,
        'module_name': stack_info.model_name,
        'invest_version': stack_info.invest_version
    }
    return json.dumps(result_dict)


@app.route('/write_parameter_set_file', methods=['POST'])
def write_parameter_set_file():
    payload = request.get_json()
    filepath = payload['parameterSetPath']
    modulename = payload['moduleName']
    args = json.loads(payload['args'])
    relative_paths = payload['relativePaths']

    natcap.invest.datastack.build_parameter_set(
        args, modulename, filepath, relative=relative_paths)
    return ('parameter set saved')


# Borrowed this function from natcap.invest.model because I assume
# that module won't persist if we eventually deprecate the Qt UI.
# TODO: we could consider refactoring this to javascript, though
# there is one call here to `natcap.invest.cli.__version__`
@app.route('/save_to_python', methods=['POST'])
def save_to_python():
    payload = request.get_json()
    save_filepath = payload['filepath']
    modelname = payload['modelname']
    pyname = payload['pyname']
    args_dict = json.loads(payload['args'])

    script_template = textwrap.dedent("""\
    # coding=UTF-8
    # -----------------------------------------------
    # Generated by InVEST {invest_version} on {today}
    # Model: {modelname}

    import {py_model}

    args = {model_args}

    if __name__ == '__main__':
        {py_model}.execute(args)
    """)

    with codecs.open(save_filepath, 'w', encoding='utf-8') as py_file:
        # cast_args = dict((unicode(key), value) for (key, value)
        #                  in args_dict.items())
        args = pprint.pformat(args_dict, indent=4)  # 4 spaces

        # Tweak formatting from pprint:
        # * Bump parameter inline with starting { to next line
        # * add trailing comma to last item item pair
        # * add extra space to spacing before first item
        args = args.replace('{', '{\n ')
        args = args.replace('}', ',\n}')
        py_file.write(script_template.format(
            invest_version=natcap.invest.cli.__version__,
            today=datetime.now().strftime('%c'),
            modelname=modelname,
            py_model=pyname,
            model_args=args))

    return ('python script saved')
