import React from "react";
import PropTypes from "prop-types";
import Typography from "@material-ui/core/Typography";
import Box from "@material-ui/core/Box";
import "./adopt.css";

export function AdoptPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <Typography
      component="div"
      role="tabpanel"
      hidden={value !== index}
      id={`adopt-tabpanel-${index}`}
      {...other}
    >
      <Box p={3}>{children}aaaaaa</Box>
    </Typography>
  );
}

AdoptPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired
};

export default AdoptPanel;
