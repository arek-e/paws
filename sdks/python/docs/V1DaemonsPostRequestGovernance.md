# V1DaemonsPostRequestGovernance

## Properties

| Name                     | Type          | Description | Notes                        |
| ------------------------ | ------------- | ----------- | ---------------------------- |
| **max_actions_per_hour** | **int**       |             | [optional]                   |
| **requires_approval**    | **List[str]** |             | [optional] [default to []]   |
| **audit_log**            | **bool**      |             | [optional] [default to True] |

## Example

```python
from paws_client.models.v1_daemons_post_request_governance import V1DaemonsPostRequestGovernance

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsPostRequestGovernance from a JSON string
v1_daemons_post_request_governance_instance = V1DaemonsPostRequestGovernance.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsPostRequestGovernance.to_json())

# convert the object into a dict
v1_daemons_post_request_governance_dict = v1_daemons_post_request_governance_instance.to_dict()
# create an instance of V1DaemonsPostRequestGovernance from a dict
v1_daemons_post_request_governance_from_dict = V1DaemonsPostRequestGovernance.from_dict(v1_daemons_post_request_governance_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
