const fetch = require("node-fetch");
const axios = require("axios");

const {
  HASURA_GRAPHQL_ENDPOINT,
  HASURA_GRAPHQL_ADMIN_SECRET,
  access_token_expires_mail
} = require("../..config");

module.exports = class user {
  static staticgetcurrentdate() {
    let i = access_token_expires_mail;
    var today = new Date();
    var date =
      today.getFullYear() +
      "-" +
      (today.getMonth() + 1) +
      "-" +
      today.getDate();
    var time =
      today.getHours() +
      ":" +
      ((today.getMinutes() + i) % 60) +
      ":" +
      today.getSeconds();
    var dateTime = date + " " + time;

    return dateTime;
  }

  static async getSecretToken(id) {
    let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": HASURA_GRAPHQL_ADMIN_SECRET
      },
      body: JSON.stringify({
        query: `  query MyQuery($id:uuid) {
          users(where: {id: {_eq: $id}}) {
            secret_token
          }
        }
        
      
          
          `,
        variables: {
          id: id
        }
      })
    });
    const data = await response.json();
    if (data.data.users.length > 0) {
      return data.data.users[0].secret_token;
    } else {
      return null;
    }
  }
  static async updateSecretTokenExpires(display_name, email) {
    let response = await fetch(HASURA_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": HASURA_GRAPHQL_ADMIN_SECRET
      },
      body: JSON.stringify({
        query: `  mutation MyMutation($email:String,$date:timestamptz) {
          __typename
          update_users(where: {email: {_eq: $email}}, _set: {secret_token_expires_at: $date}) {
            affected_rows
            returning {
              id
            }
          }
        }
      
          
          `,
        variables: {
          email: email,
          date: this.staticgetcurrentdate()
        }
      })
    });
    const data = await response.json();
    if (data.data.update_users.returning.length > 0) {
      return data.data.update_users.returning[0].id;
    } else {
      return null;
    }
  }

  static async activateAccount(id) {
    try {
      let secret_token = await this.getSecretToken(id);
      if (secret_token != null) {
        var data = await axios.post(
          `https://auth.skiliks.net/auth/activate-account`,
          {
            secret_token: secret_token
          }
        );
        if (data.data.statusCode) return null;
        return data;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }
};
