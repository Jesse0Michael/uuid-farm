import React from "react";
import PropTypes from "prop-types";
import Typography from "@material-ui/core/Typography";
import Box from "@material-ui/core/Box";
import "./surrender.css";

export function SurrenderPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <Typography
      component="div"
      role="tabpanel"
      hidden={value !== index}
      id={`surrender-tabpanel-${index}`}
      {...other}
    >
      <Box p={3}>{children}ssssss</Box>
    </Typography>
  );
}

SurrenderPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired
};

export default SurrenderPanel;
