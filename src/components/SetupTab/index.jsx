import fs from 'fs';
import React from 'react';
import Electron from 'electron';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import InputGroup from 'react-bootstrap/InputGroup';

export class SetupTab extends React.Component {

  render () {

    // Only mount the ArgsForm when there are actually args
    // This lets us have an ArgsForm.componentDidMount() that
    // does useful initialization of args state.
    if (this.props.args) {
      return (
        <div>
          <ArgsForm 
            args={this.props.args}
            modulename={this.props.modulename}
            updateArg={this.props.updateArg}
            batchUpdateArgs={this.props.batchUpdateArgs}
            investValidate={this.props.investValidate}
            argsValuesFromSpec={this.props.argsValuesFromSpec}
          />
          <Button 
            variant="primary" 
            size="lg"
            onClick={this.props.investExecute}
            disabled={!this.props.argsValid}>
                Execute
          </Button>
        </div>);
    }
    // The SetupTab remains disabled in this route, so no need
    // to render anything here.
    return(<div>No args to see here</div>)
  }
}

class ArgsForm extends React.Component {

  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.selectFile = this.selectFile.bind(this);
    this.onJsonDrop = this.onJsonDrop.bind(this);
  }

  componentDidMount() {
    // Validate args immediately on mount. Values will be `undefined`
    // but converted to empty strings by `argsValuesFromSpec` 
    // Validation will handle updating the `valid` property
    // of the optional and conditionally required args so that they 
    // can validate without any user-interaction.

    // TODO: could call batchUpdateArgs here instead
    // to avoid passing investValidate to this component at all.
    // this.props.batchUpdateArgs(JSON.parse(args_dict_string));
    const args_dict_string = this.props.argsValuesFromSpec(this.props.args);
    this.props.investValidate(args_dict_string);
  }

  handleChange(event) {
    // Handle changes in form text inputs
    const value = event.target.value;
    const name = event.target.name;
    this.props.updateArg(name, value);
  }

  selectFile(event) {
    // Handle clicks on form browse-button inputs
    const dialog = Electron.remote.dialog;
    const argtype = event.target.value;
    const argname = event.target.name;
    const prop = (argtype === 'directory') ? 'openDirectory' : 'openFile'
    // TODO: could add more filters based on argType (e.g. only show .csv)
    dialog.showOpenDialog({
      properties: [prop]
    }, (filepath) => {
      this.props.updateArg(argname, filepath[0]); // 0 is safe since we only allow 1 selection
    })
  }

  onJsonDrop(event) {
    // Handle drag-drop of datastack JSON files
    // TODO: handle errors when dropped file is not valid JSON
    event.preventDefault();
    
    const fileList = event.dataTransfer.files;
    if (fileList.length !== 1) {
      throw alert('only drop one file at a time.')
    }
    const filepath = fileList[0].path;
    const modelParams = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    if (this.props.modulename === modelParams.model_name) {
      this.props.batchUpdateArgs(modelParams.args);
    } else {
      throw alert('parameter file does not match this model.')
    }
  }

  render() {
    const current_args = Object.assign({}, this.props.args)
    let formItems = [];
    for (const argname in current_args) {
      if (argname === 'n_workers') { continue }
      const argument = current_args[argname];

      // These types need a text input and a file browser button
      if (['csv', 'vector', 'raster', 'directory'].includes(argument.type)) {
        formItems.push(
          <Form.Group as={Row} key={argname}>
            <Form.Label column sm="3">{argument.name}</Form.Label>
            <Col sm="8">
              <InputGroup>
                <Form.Control
                  name={argname}
                  type="text" 
                  value={argument.value || ''} // empty string is handled better than `undefined`
                  onChange={this.handleChange}
                  isValid={argument.touched && argument.valid}
                  isInvalid={argument.touched && argument.validationMessage}
                />
                <InputGroup.Append>
                  <Button 
                    variant="outline-secondary"
                    value={argument.type}  // dialog will limit options to files or dirs accordingly
                    name={argname}
                    onClick={this.selectFile}>
                    Browse
                  </Button>
                </InputGroup.Append>
                <Form.Control.Feedback type='invalid'>
                  {argument.type + ' : ' + (argument.validationMessage || '')}
                </Form.Control.Feedback>
              </InputGroup>
            </Col>
          </Form.Group>)
      
      // These types need a text input
      } else if (['freestyle_string', 'number'].includes(argument.type)) {
        formItems.push(
          <Form.Group as={Row} key={argname}>
            <Form.Label column sm="3">{argument.name}</Form.Label>
            <Col sm="4">
              <Form.Control
                name={argname}
                type="text" 
                value={argument.value || ''} // empty string is handled better than `undefined`
                onChange={this.handleChange}
                isValid={argument.touched && argument.valid}
                isInvalid={argument.touched && argument.validationMessage}
              />
              <Form.Control.Feedback type='invalid'>
                {argument.type + ' : ' + (argument.validationMessage || '')}
              </Form.Control.Feedback>
            </Col>
          </Form.Group>)
      
      // Radio select for boolean args
      } else if (argument.type === 'boolean') {
        // argument.value will be type boolean if it's coming from an args dict
        // generated by natcap.invest. But it will be type string if the value
        // is set from this UI, because html forms always submit strings.
        // So, `checked` property must accomodate both types to determine state.
        formItems.push(
          <Form.Group as={Row} key={argname}>
            <Form.Label column sm="3">{argument.name}</Form.Label>
            <Col sm="8">
              <Form.Check
                inline
                type="radio"
                label="Yes"
                value={"true"}
                checked={argument.value || argument.value === "true"}
                onChange={this.handleChange}
                name={argname}
              />
              <Form.Check
                inline
                type="radio"
                label="No"
                value={"false"}
                checked={!argument.value || argument.value === "false"}
                onChange={this.handleChange}
                name={argname}
              />
            </Col>
          </Form.Group>)

      // Dropdown menus for args with options
      } else if (argument.type === 'option_string') {
        formItems.push(
          <Form.Group as={Row} key={argname}>
            <Form.Label column sm="3">{argument.name}</Form.Label>
            <Col sm="4">
              <Form.Control
                as='select'
                name={argname}
                value={argument.value}
                onChange={this.handleChange}>
                {argument.validation_options.options.map(opt =>
                  <option value={opt} key={opt}>{opt}</option>
                )}
              </Form.Control>
              <Form.Control.Feedback type='invalid'>
                {argument.type + ' : ' + (argument.validationMessage || '')}
              </Form.Control.Feedback>
            </Col>
          </Form.Group>)
      }
    }

    return (
      <Form 
        validated={false}
        onDrop={this.onJsonDrop}
        onDragOver={dragover_handler}>
        {formItems}
      </Form>
    );
  }
}

function dragover_handler(event) {
 event.preventDefault();
 event.dataTransfer.dropEffect = "move";
}