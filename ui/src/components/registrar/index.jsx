import React, { Component } from "react";
import Paper from "@material-ui/core/Paper";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import AdoptPanel from "../../components/adopt";
import SurrenderPanel from "../../components/surrender";
import "./registrar.css";

class Registrar extends Component {
  constructor(p) {
    super(p);
    this.state = {
      value: 0
    };
  }

  handleChange = (event, newValue) => {
    this.setState({ value: newValue });
  };

  render() {
    return (
      <Paper className="registrar" elevation="7">
        <Tabs
          value={this.state.value}
          indicatorColor="secondary"
          textColor="primary"
          onChange={this.handleChange}
        >
          <Tab label="Adopt" />
          <Tab label="Surrender" />
        </Tabs>
        <AdoptPanel value={this.state.value} index={0} />
        <SurrenderPanel value={this.state.value} index={1} />
      </Paper>
    );
  }
}

export default Registrar;
